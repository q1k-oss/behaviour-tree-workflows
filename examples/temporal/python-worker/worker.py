#!/usr/bin/env python3
"""
Python Worker for behaviour-tree workflows

This worker handles data processing activities that benefit from Python's
superior data libraries (pandas, openpyxl, rapidfuzz).

Usage:
    pip install -r requirements.txt
    python worker.py

Environment variables:
    TEMPORAL_HOST: Temporal server host (default: localhost:7233)
    TEMPORAL_NAMESPACE: Temporal namespace (default: default)
    TASK_QUEUE: Task queue name (default: behaviour-tree-workflows)
    PERSISTENT_STORAGE: Path for persistent file storage (default: /tmp/persistent)
"""

import asyncio
import logging
import os
import signal
import sys

from temporalio.client import Client
from temporalio.worker import Worker

from activities import parse_file, generate_file, execute_python_script


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


async def main():
    """Main entry point for the Python worker."""
    # Configuration from environment
    temporal_host = os.environ.get("TEMPORAL_HOST", "localhost:7233")
    namespace = os.environ.get("TEMPORAL_NAMESPACE", "default")
    task_queue = os.environ.get("TASK_QUEUE", "behaviour-tree-workflows")

    logger.info(f"Connecting to Temporal at {temporal_host} (namespace: {namespace})")

    try:
        # Connect to Temporal
        client = await Client.connect(temporal_host, namespace=namespace)
        logger.info("Connected to Temporal server")

        # Create worker with Python activities
        worker = Worker(
            client,
            task_queue=task_queue,
            activities=[
                parse_file,
                generate_file,
                execute_python_script,
            ],
        )

        logger.info(f"Starting Python worker on task queue: {task_queue}")
        logger.info("Registered activities:")
        logger.info("  - parse_file: Parse CSV/Excel files into structured data")
        logger.info("  - generate_file: Generate CSV/Excel/JSON files from data")
        logger.info("  - execute_python_script: Execute Python code with pandas/numpy")

        # Handle graceful shutdown
        shutdown_event = asyncio.Event()

        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, initiating graceful shutdown...")
            shutdown_event.set()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # Run worker until shutdown
        async with worker:
            logger.info("Python worker started successfully")
            await shutdown_event.wait()

        logger.info("Python worker shut down gracefully")

    except Exception as e:
        logger.error(f"Worker failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     behaviour-tree Python Worker                                        ║
║                                                                                ║
║  Activities:                                                                   ║
║    - parse_file: Parse CSV/Excel files into structured data                   ║
║    - generate_file: Generate CSV/Excel/JSON files from data                   ║
║    - execute_python_script: Execute Python code with pandas/numpy/rapidfuzz   ║
║                                                                                ║
║  Press Ctrl+C to stop                                                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
    """)
    asyncio.run(main())
