"""Tests de `_matches_declared_image_type` (M6 de l'audit sécurité) :
vérifie les octets magiques plutôt que de faire confiance à `Content-Type`,
qui n'est qu'une déclaration du client — fonction pure, isolée de la base.
"""

from __future__ import annotations

from app.api.routes import _matches_declared_image_type

JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF"
PNG_HEADER = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
WEBP_HEADER = b"RIFF\x00\x00\x00\x00WEBPVP8 "


def test_accepts_real_jpeg_bytes() -> None:
    assert _matches_declared_image_type(JPEG_HEADER, "image/jpeg")


def test_accepts_real_png_bytes() -> None:
    assert _matches_declared_image_type(PNG_HEADER, "image/png")


def test_accepts_real_webp_bytes() -> None:
    assert _matches_declared_image_type(WEBP_HEADER, "image/webp")


def test_rejects_mislabeled_content() -> None:
    # Des octets HTML/script étiquetés "image/png" par le client (en-tête
    # multipart librement falsifiable) ne doivent jamais passer.
    html_bytes = b"<script>alert(1)</script>"
    assert not _matches_declared_image_type(html_bytes, "image/png")


def test_rejects_png_bytes_declared_as_jpeg() -> None:
    assert not _matches_declared_image_type(PNG_HEADER, "image/jpeg")


def test_rejects_empty_content() -> None:
    assert not _matches_declared_image_type(b"", "image/png")
