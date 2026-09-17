"""Cover response authorization and cache policy, with an isolated database double."""
import uuid
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from app.api.routes import get_cover_image
from app.db.models import Event, User


@pytest.mark.parametrize("mode,viewer", [("open", "anonymous"), ("approval", "owner"), ("approval", "approved")])
async def test_cover_is_authorized_and_never_cached(mode, viewer):
    owner_id = uuid.uuid4()
    event = Event(id=uuid.uuid4(), owner_id=owner_id, access_mode=mode,
                  cover_image=b"image", cover_image_content_type="image/png")
    user = None if viewer == "anonymous" else User(id=owner_id if viewer == "owner" else uuid.uuid4())
    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one_or_none=Mock(return_value=event))
    db.scalar.return_value = uuid.uuid4() if viewer == "approved" else None
    response = await get_cover_image(event.id, db, user)
    assert response.body == b"image"
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("authenticated", [False, True])
async def test_private_cover_denies_unapproved_visitors(authenticated):
    event = Event(id=uuid.uuid4(), owner_id=uuid.uuid4(), access_mode="approval",
                  cover_image=b"image", cover_image_content_type="image/png")
    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one_or_none=Mock(return_value=event))
    db.scalar.return_value = None
    with pytest.raises(HTTPException) as error:
        await get_cover_image(event.id, db, User(id=uuid.uuid4()) if authenticated else None)
    assert error.value.status_code == 403
