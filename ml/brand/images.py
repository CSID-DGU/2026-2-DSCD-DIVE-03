"""Bound and validate official-site image downloads (ZIP prototype rules)."""

import base64
import io
import ipaddress
import socket
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps


def is_public_host(host):

    if not host:
        return False

    try:
        addresses = socket.getaddrinfo(host, None)

        return all(
            ipaddress.ip_address(addr[4][0]).is_global
            for addr in addresses
        )

    except Exception:
        return False

def prepare_image(url):

    parsed = urlparse(url)

    if parsed.scheme != "https":
        raise ValueError("HTTPS 이미지만 허용합니다.")

    if not is_public_host(parsed.hostname):
        raise ValueError("허용되지 않은 이미지 호스트입니다.")

    response_img = requests.get(
        url,
        timeout=12,
        stream=True,
        allow_redirects=False,
        headers={
            "User-Agent": "POPCASTResearchPrototype/1.0"
        }
    )

    try:
        response_img.raise_for_status()

        if response_img.is_redirect:
            raise ValueError("리다이렉트된 이미지 URL입니다.")

        content_type = response_img.headers.get(
            "Content-Type", ""
        ).lower()

        if not content_type.startswith("image/"):
            raise ValueError("이미지 파일이 아닙니다.")

        chunks = []
        total = 0

        for chunk in response_img.iter_content(
            chunk_size=65536
        ):
            total += len(chunk)

            if total > 6_000_000:
                raise ValueError("이미지가 너무 큽니다.")

            chunks.append(chunk)

        image_bytes = b"".join(chunks)

        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)

        if image.width < 320 or image.height < 200:
            raise ValueError("이미지가 너무 작습니다.")

        if image.width * image.height > 30_000_000:
            raise ValueError("이미지 픽셀 수가 너무 많습니다.")

        image = image.convert("RGB")
        image.thumbnail((1024, 1024))

        buffer = io.BytesIO()

        image.save(
            buffer,
            format="JPEG",
            quality=80
        )

        encoded = base64.b64encode(
            buffer.getvalue()
        ).decode("ascii")

        data_uri = "data:image/jpeg;base64," + encoded

        return image, data_uri
    finally:
        response_img.close()
