"""Run from backend: python -m scripts.backfill_event_timezones (safe to rerun)."""
import asyncio

from sqlalchemy import select

from app.db.base import get_engine, get_sessionmaker
from app.db.models import Event
from app.event_schedule import timezone_for_location


async def main():
    updated = 0
    failed = 0
    try:
        async with get_sessionmaker()() as session:
            events = (await session.scalars(select(Event).where(Event.timezone.is_(None)))).all()
            for event in events:
                try:
                    event.timezone = timezone_for_location(event.depot_lat, event.depot_lon)
                except ValueError:
                    failed += 1
                    continue
                await session.commit()
                updated += 1
        print(f"Timezones: {updated} updated, {failed} unresolved.")
        if failed:
            raise RuntimeError("Some event timezones could not be resolved; no UTC default was applied.")
    finally:
        await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(main())
