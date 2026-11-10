"""Safe, actionable analysis errors; raw SDK errors stay in server logs."""
from requests.exceptions import Timeout


from ml.brand.urls import BrandInputError


def collection_failure_message(exc, context):
    if isinstance(exc, Timeout):
        return f'{context} 요청 시간이 초과되었습니다.'
    return f'{context} 요청 실패'


class BrandAnalysisError(ValueError):
    def __init__(self, code, message, *, details=None, action='잠시 후 다시 시도하거나 다른 공식 홈페이지 URL을 입력해 주세요.'):
        super().__init__(message)
        self.code = code
        self.details = details or {}
        self.action = action

    def as_detail(self):
        return {'code':self.code, 'message':str(self), 'action':self.action,
                'reasons':self.details}


def evidence_error(collection, source_validation, image_count):
    original = collection.get('original_failure_reason')
    alternate = collection.get('fallback_failure_reason')
    discovery = collection.get('discovery_failure_reason')
    reasons = []
    if original:
        reasons.append(f'공식 홈페이지: {original}')
    if alternate:
        reasons.append(f'대체 공식몰: {alternate}')
    elif not collection.get('fallback_used') and discovery:
        reasons.append(discovery)
    if collection.get('fallback_used') and not image_count:
        reasons.append('대체 공식몰에서 분석 가능한 텍스트·이미지를 확보하지 못했습니다')
    if not source_validation.get('accepted_count') or source_validation.get('rejected_sources'):
        reasons.append('검증된 공식 검색 근거를 확보하지 못했습니다')
    return BrandAnalysisError('BRAND_EVIDENCE_UNAVAILABLE',
        '브랜드 분석 자료를 수집하지 못했습니다. ' + '; '.join(reasons) + '.',
        details={'homepage_reason':original, 'alternate_reason':alternate,
                 'discovery_reason':discovery, 'image_count':image_count,
                 'research_source_validation':source_validation,
                 'fallback_attempts':collection.get('fallback_attempts',[])})
