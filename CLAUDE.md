# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`1dcnn-a` is a Python 3.12 project using a 1D CNN model for stock market data analysis, with stock data sourced from the Alpaca Markets API. The database backend is MariaDB 10.11 running in Docker, hosted on a remote home server.

## Environment Setup

This project uses `uv` for package management (`.venv` is local, Python 3.12 pinned via `.python-version`).

```bash
uv sync          # install dependencies
uv run main.py   # run the app
```

Environment variables are in `.env` (root) — Alpaca API credentials and DB connection settings. Never commit `.env`.

## Database

MariaDB runs via Docker Compose on a remote server (`192.168.142.174:3306`).

```bash
# Start the database (run from mysql/)
cd mysql && docker compose up -d

# Interactive MySQL shell
docker exec -it mysql_db mysql -uroot -p

# Backup data volume
docker run --rm -v mariadb_data:/data -v $(pwd)/backup:/backup ubuntu tar cvf /backup/mariadb_backup_$(date +%F).tar /data
```

The app connects as the `stock_app` user to the `stock_app` database (see root `.env`). The `mysql/` directory contains:
- `docker-compose.yml` — MariaDB service definition (resource-limited for an E5300 server)
- `mysql-conf/my.cnf` — InnoDB tuning (`innodb_buffer_pool_size=256M`)
- `.env` — Docker Compose secrets (separate from root `.env`)

The remote server requires a firewall rule allowing `192.168.142.0/24` on port 3306.

## Code Structure

```
main.py          # entry point (placeholder)
src/             # all application code goes here
mysql/           # Docker-based MariaDB setup
pyproject.toml   # project metadata and dependencies
```

All code must be created under `src/`. The `main.py` entry point imports from there.
