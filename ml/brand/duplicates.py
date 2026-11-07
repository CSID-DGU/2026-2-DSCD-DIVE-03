"""Conservative duplicate checks for responsive image assets."""
import hashlib
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from PIL import Image


_RESIZE_PARAMS = {'width', 'height', 'w', 'h', 'imwidth', 'imheight', 'dpr', 'q', 'quality', 'format', 'fm', 'f'}


def asset_key(url):
    parsed = urlsplit(url)
    # Responsive file variants share an asset; content versions/crop parameters remain.
    path = parsed.path
    # Plain small/large may name different content; only explicit retina suffixes
    # and Apple's known responsive convention are collapsed here.
    suffix = r'_(?:small|medium|large)(?:tall)?_2x(?=\.[A-Za-z0-9]+$)'
    if (parsed.hostname or '').endswith('.apple.com') or parsed.hostname == 'apple.com':
        suffix = r'_(?:small|medium|large)(?:tall)?(?:_2x)?(?=\.[A-Za-z0-9]+$)'
    path = re.sub(suffix, '', path)
    query = []
    for k, v in parse_qsl(parsed.query, keep_blank_values=True):
        key = k.lower()
        is_render_option = key in _RESIZE_PARAMS
        if key == 'f':
            is_render_option = v.lower() in {'xxs','xs','s','m','l','xl','xu','jpg','jpeg','png','webp','avif','auto'}
        if not is_render_option:
            query.append((k, v))
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, urlencode(sorted(query)), ''))


def _pixels(image):
    if not isinstance(image, Image.Image):
        return None
    sample = image.convert('RGB').resize((32, 32), Image.Resampling.LANCZOS)
    return image.width / image.height, list(sample.tobytes())


class ImageDuplicates:
    def __init__(self):
        self.assets = set()
        self.digests = set()
        self.samples = []
        self.rejected = []

    def known_asset(self, url):
        if asset_key(url) in self.assets:
            self.rejected.append({'url': url, 'reason': 'same_responsive_asset'})
            return True
        return False

    def add(self, url, image, data_uri):
        digest = hashlib.sha256(data_uri.encode()).hexdigest()
        sample = _pixels(image)
        reason = 'same_image_bytes' if digest in self.digests else None
        if not reason and sample is not None:
            ratio, pixels = sample
            for old_ratio, old_pixels in self.samples:
                # Aspect and color/spatial comparison reduce false matches between different photos.
                if abs(ratio / old_ratio - 1) <= .02:
                    distance = sum(abs(a - b) for a, b in zip(pixels, old_pixels, strict=True)) / len(pixels)
                    if distance <= 2.0:
                        reason = 'same_normalized_pixels'
                        break
        if reason:
            self.rejected.append({'url': url, 'reason': reason})
            return False
        self.assets.add(asset_key(url))
        self.digests.add(digest)
        if sample is not None:
            self.samples.append(sample)
        return True
