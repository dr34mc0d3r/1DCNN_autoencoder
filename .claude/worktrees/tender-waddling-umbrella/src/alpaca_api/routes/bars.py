from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..alpaca import fetch_bars
from ..storage import save_bars_to_csv, save_bars_to_db

router = APIRouter(prefix="/bars", tags=["bars"])


@router.get("")
def get_bars(
    symbols: str = Query(..., description="Comma-separated ticker symbols, e.g. AAPL,MSFT"),
    timeframe: str = Query("1Day", description="Bar timeframe: 1Min, 5Min, 1Hour, 1Day"),
    start: str = Query(..., description="Start date ISO 8601, e.g. 2024-01-01"),
    end: str = Query(..., description="End date ISO 8601, e.g. 2024-12-31"),
    save_to: Optional[str] = Query(None, description="Storage destination: db, csv, or db,csv for both"),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    data = fetch_bars(symbol_list, timeframe, start, end)

    destinations = [d.strip() for d in save_to.split(",")] if save_to else []
    invalid = [d for d in destinations if d not in ("db", "csv")]
    if invalid:
        raise HTTPException(status_code=400, detail=f"save_to values must be 'db' or 'csv', got: {invalid}")

    saved: dict[str, list[str]] = {}
    for symbol, bars in data.get("bars", {}).items():
        saved[symbol] = []
        if "db" in destinations:
            save_bars_to_db(symbol, timeframe, bars)
            saved[symbol].append("db")
        if "csv" in destinations:
            path = save_bars_to_csv(symbol, timeframe, bars)
            saved[symbol].append(path)

    return {"data": data, "saved": saved}
