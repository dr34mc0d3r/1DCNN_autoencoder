import httpx
from .config import ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_DATA_BASE_URL

_HEADERS = {
    "APCA-API-KEY-ID": ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
}


def fetch_bars(symbols: list[str], timeframe: str, start: str, end: str) -> dict:
    all_bars: dict[str, list] = {s: [] for s in symbols}
    params: dict = {
        "symbols": ",".join(symbols),
        "timeframe": timeframe,
        "start": start,
        "end": end,
        "adjustment": "split",
        "feed": "iex",
        "limit": 10000,
    }
    page = 0
    with httpx.Client(timeout=60) as client:
        while True:
            r = client.get(
                f"{ALPACA_DATA_BASE_URL}/v2/stocks/bars",
                headers=_HEADERS,
                params=params,
            )
            r.raise_for_status()
            body = r.json()
            page += 1

            for symbol, bars in body.get("bars", {}).items():
                all_bars.setdefault(symbol, []).extend(bars)

            next_token = body.get("next_page_token")
            if not next_token:
                break
            params["page_token"] = next_token

    total = sum(len(v) for v in all_bars.values())
    print(f"fetch_bars: {page} page(s), {total} total bars")
    return {"bars": all_bars}


def fetch_news(symbols: list[str], start: str, end: str, limit: int = 50) -> dict:
    with httpx.Client() as client:
        r = client.get(
            f"{ALPACA_DATA_BASE_URL}/v1beta1/news",
            headers=_HEADERS,
            params={
                "symbols": ",".join(symbols),
                "start": start,
                "end": end,
                "limit": limit,
                "sort": "desc",
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()
