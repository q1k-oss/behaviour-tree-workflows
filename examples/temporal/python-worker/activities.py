"""
Python Activity Implementations for behaviour-tree workflows

These activities handle data processing operations that benefit from Python's
superior data libraries (pandas, openpyxl, rapidfuzz).

Activities:
- parse_file: Parse CSV/Excel files into structured data
- generate_file: Generate CSV/Excel/JSON files from data
- execute_python_script: Execute Python code with blackboard access
"""

import os
import json
import tempfile
from typing import Any, Dict, List, Optional
from temporalio import activity
import pandas as pd
import numpy as np
from rapidfuzz import fuzz, process


# ─────────────────────────────────────────────────────────────────────────────
# ParseFile Activity
# ─────────────────────────────────────────────────────────────────────────────

@activity.defn
async def parse_file(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse CSV/Excel file into structured data.

    Args:
        request: Dictionary containing:
            - file: Path to file
            - format: File format (csv, xlsx, xls, auto)
            - sheetName: Sheet name for Excel (optional)
            - columnMapping: Column rename mapping (optional)
            - options: Parse options (optional)
                - skipRows: Number of rows to skip
                - trim: Trim whitespace from values
                - emptyAsNull: Treat empty strings as None
                - dateColumns: Columns to parse as dates
                - dateFormat: Date format string

    Returns:
        Dictionary containing:
            - data: List of row dictionaries
            - rowCount: Number of rows parsed
            - columns: List of column names
    """
    file_path = request.get("file")
    format_type = request.get("format", "auto")
    sheet_name = request.get("sheetName")
    column_mapping = request.get("columnMapping", {})
    options = request.get("options", {})

    activity.logger.info(f"Parsing file: {file_path} (format: {format_type})")

    # Auto-detect format from file extension
    if format_type == "auto":
        ext = os.path.splitext(file_path)[1].lower()
        if ext in [".xlsx", ".xls"]:
            format_type = "xlsx" if ext == ".xlsx" else "xls"
        else:
            format_type = "csv"

    # Read file into DataFrame
    try:
        if format_type == "csv":
            df = pd.read_csv(
                file_path,
                skiprows=options.get("skipRows", 0),
                skipinitialspace=options.get("trim", True),
            )
        else:  # xlsx or xls
            df = pd.read_excel(
                file_path,
                sheet_name=sheet_name or 0,
                skiprows=options.get("skipRows", 0),
                engine="openpyxl" if format_type == "xlsx" else None,
            )
    except FileNotFoundError:
        raise ValueError(f"File not found: {file_path}")
    except Exception as e:
        raise ValueError(f"Failed to read file {file_path}: {str(e)}")

    # Apply column mapping (rename columns)
    if column_mapping:
        df = df.rename(columns=column_mapping)

    # Trim whitespace from string columns
    if options.get("trim", True):
        for col in df.select_dtypes(include=["object"]).columns:
            df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)

    # Convert empty strings to None
    if options.get("emptyAsNull", False):
        df = df.replace("", None)

    # Parse date columns
    date_columns = options.get("dateColumns", [])
    date_format = options.get("dateFormat")
    for col in date_columns:
        if col in df.columns:
            try:
                df[col] = pd.to_datetime(df[col], format=date_format)
                # Convert to ISO format string for JSON serialization
                df[col] = df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
            except Exception as e:
                activity.logger.warning(f"Failed to parse date column {col}: {e}")

    # Replace NaN/NaT with None for JSON serialization
    df = df.where(pd.notnull(df), None)

    # Convert to list of dictionaries
    data = df.to_dict("records")

    activity.logger.info(f"Parsed {len(data)} rows, columns: {list(df.columns)}")

    return {
        "data": data,
        "rowCount": len(data),
        "columns": list(df.columns),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GenerateFile Activity
# ─────────────────────────────────────────────────────────────────────────────

@activity.defn
async def generate_file(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate CSV/Excel/JSON file from data.

    Args:
        request: Dictionary containing:
            - format: Output format (csv, xlsx, json)
            - data: List of row dictionaries
            - columns: Column definitions (optional)
                - header: Display header name
                - key: Data key
                - width: Column width (Excel only)
            - filename: Output filename
            - storage: Storage type (temp, persistent)

    Returns:
        Dictionary containing:
            - filename: Generated filename
            - contentType: MIME type
            - size: File size in bytes
            - path: Full file path
            - url: Download URL (if persistent)
    """
    format_type = request.get("format")
    data = request.get("data", [])
    columns = request.get("columns")
    filename = request.get("filename")
    storage = request.get("storage", "temp")

    activity.logger.info(f"Generating {format_type} file: {filename} ({len(data)} rows)")

    # Create DataFrame from data
    df = pd.DataFrame(data)

    # Reorder and rename columns if specified
    if columns:
        col_order = [c["key"] for c in columns if c["key"] in df.columns]
        df = df[col_order]
        header_map = {c["key"]: c["header"] for c in columns}
        df = df.rename(columns=header_map)

    # Determine output directory
    if storage == "temp":
        output_dir = tempfile.gettempdir()
    else:
        output_dir = os.environ.get("PERSISTENT_STORAGE", "/tmp/persistent")
        os.makedirs(output_dir, exist_ok=True)

    file_path = os.path.join(output_dir, filename)

    # Write file based on format
    if format_type == "csv":
        df.to_csv(file_path, index=False)
        content_type = "text/csv"
    elif format_type == "xlsx":
        # Write with openpyxl for xlsx support
        with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Sheet1")

            # Apply column widths if specified
            if columns:
                worksheet = writer.sheets["Sheet1"]
                for i, col_def in enumerate(columns):
                    if "width" in col_def:
                        # openpyxl uses 1-based column indexing
                        col_letter = chr(65 + i)  # A, B, C, etc.
                        worksheet.column_dimensions[col_letter].width = col_def["width"]

        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:  # json
        df.to_json(file_path, orient="records", indent=2)
        content_type = "application/json"

    # Get file size
    size = os.path.getsize(file_path)

    # Generate URL for persistent storage
    url = None
    if storage == "persistent":
        # In a real implementation, this would upload to S3/GCS and return a signed URL
        url = f"/files/{filename}"

    activity.logger.info(f"Generated file: {file_path} ({size} bytes)")

    return {
        "filename": filename,
        "contentType": content_type,
        "size": size,
        "path": file_path,
        "url": url,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PythonScript Activity
# ─────────────────────────────────────────────────────────────────────────────

@activity.defn
async def execute_python_script(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute Python code with blackboard access.

    The code has access to:
        - bb: dict - Blackboard state (read/write)
        - input: dict - Workflow input (read-only)
        - env: dict - Environment variables
        - pd: pandas module
        - np: numpy module
        - fuzz: rapidfuzz.fuzz module (for fuzzy string matching)
        - process: rapidfuzz.process module (for fuzzy extraction)

    Args:
        request: Dictionary containing:
            - code: Python code to execute
            - blackboard: Current blackboard state
            - input: Workflow input (optional)
            - env: Environment variables (optional)
            - timeout: Execution timeout in ms (optional)

    Returns:
        Dictionary containing:
            - blackboard: Modified blackboard state
            - stdout: Captured stdout (if any)
            - stderr: Captured stderr (if any)
    """
    code = request.get("code", "")
    bb = request.get("blackboard", {})
    input_data = request.get("input", {})
    env = request.get("env", {})

    activity.logger.info(f"Executing Python script ({len(code)} chars)")

    # Create execution context with available libraries
    local_vars: Dict[str, Any] = {
        "bb": bb,
        "input": input_data,
        "env": env,
        "pd": pd,
        "np": np,
        "fuzz": fuzz,
        "process": process,
    }

    # Capture stdout/stderr
    import io
    import sys

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    old_stdout = sys.stdout
    old_stderr = sys.stderr

    try:
        sys.stdout = stdout_capture
        sys.stderr = stderr_capture

        # Execute user code
        # Note: In production, consider using a sandboxed execution environment
        exec(code, {"__builtins__": __builtins__}, local_vars)

    except Exception as e:
        activity.logger.error(f"Python script execution failed: {e}")
        raise ValueError(f"Script execution failed: {str(e)}")
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    stdout_output = stdout_capture.getvalue()
    stderr_output = stderr_capture.getvalue()

    if stdout_output:
        activity.logger.info(f"Script stdout: {stdout_output[:500]}")
    if stderr_output:
        activity.logger.warning(f"Script stderr: {stderr_output[:500]}")

    # Convert any numpy/pandas types to JSON-serializable types
    result_bb = _make_json_serializable(local_vars["bb"])

    activity.logger.info(f"Script completed, {len(result_bb)} blackboard keys")

    return {
        "blackboard": result_bb,
        "stdout": stdout_output,
        "stderr": stderr_output,
    }


def _make_json_serializable(obj: Any) -> Any:
    """Convert numpy/pandas types to JSON-serializable Python types."""
    if isinstance(obj, dict):
        return {k: _make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_make_json_serializable(item) for item in obj]
    elif isinstance(obj, pd.DataFrame):
        return obj.to_dict("records")
    elif isinstance(obj, pd.Series):
        return obj.tolist()
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.integer, np.floating)):
        return obj.item()
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif pd.isna(obj):
        return None
    else:
        return obj
