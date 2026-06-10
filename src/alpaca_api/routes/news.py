from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..alpaca import fetch_news
from ..storage import save_news_to_csv, save_news_to_db

router = APIRouter(prefix="/news", tags=["news"])


@router.get("")
def get_news(
    symbols: str = Query(..., description="Comma-separated ticker symbols, e.g. AAPL,MSFT"),
    start: str = Query(..., description="Start date ISO 8601, e.g. 2024-01-01"),
    end: str = Query(..., description="End date ISO 8601, e.g. 2024-12-31"),
    limit: int = Query(50, description="Max articles to return (Alpaca max: 50 per page)"),
    save_to: Optional[str] = Query(None, description="Storage destination: db or csv"),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    data = fetch_news(symbol_list, start, end, limit)
    articles = data.get("news", [])

    saved = None
    if save_to:
        if save_to not in ("db", "csv"):
            raise HTTPException(status_code=400, detail=f"save_to must be 'db' or 'csv', got '{save_to}'")
        if save_to == "db":
            save_news_to_db(articles)
            saved = "db"
        else:
            saved = save_news_to_csv(symbol_list, articles)

    return {"data": data, "saved": saved}
