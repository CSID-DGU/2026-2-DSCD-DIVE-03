"""Check existing description exclusions and regenerate from the same evidence."""
import json
import re


_EXCLUDED = {
    '가격·요금·할인': r'가격|요금|비용|가성비|저렴|할인|판매가|\b(?:price|pricing|discount|affordable|cheap)\b|\d[\d,.]*\s*(?:원|달러|USD|KRW)',
    '매출·경영·연혁': r'매출|경영|연혁|설립|창업|운영\s*철학|\b(?:revenue|founded|sales\s+figures|management\s+philosophy)\b',
    '배송·소비자 소통': r'배송|고객\s*(?:소통|서비스)|소비자\s*소통|\b(?:shipping|delivery|customer\s+(?:service|communication))\b',
    'Trait 점수 직접 표기': r'(?:Trait|점수)\s*[:=]|\d+(?:\.\d+)?\s*점',
}


def description_issues(description, image_only=False, has_images=False):
    if not isinstance(description, str) or not description.strip():
        return ['설명은 비어 있지 않은 문자열이어야 합니다.']
    issues = []
    if len(description) > 150:
        issues.append('설명은 150자 이내여야 합니다.')
    for label, pattern in _EXCLUDED.items():
        if re.search(pattern, description, re.IGNORECASE):
            issues.append(f'제외 대상 포함: {label}')
    if image_only:
        if not description.startswith('이미지에서는'):
            issues.append('공식 텍스트가 없으므로 이미지 관찰임을 명시해야 합니다.')
        if re.search(r'공식적|공식\s*철학|선언|추구|브랜드\s*철학', description):
            issues.append('이미지 관찰을 공식 철학·추구미로 단정하지 마세요.')
    if not has_images and re.search(r'(?:이미지|사진)에서(?:는)?|직접\s*관찰', description):
        issues.append('이미지가 없으므로 실제 이미지 관찰을 주장하지 마세요.')
    return issues


def build_description(client, model, prompt, task, image_count):
    image_only = not task['official_research'].strip() and not task['homepage_text'].strip()
    instruction = prompt + (
        '\n최종 설명에서 가격·할인·매출·경영·연혁·배송·고객 소통은 제외하세요. '
        '원자료에 있더라도 추출 대상은 감성·분위기·색감·스타일·디자인입니다. '
        '근거 없는 형용사를 보태지 말고, 부족하면 짧게 쓰세요.'
    )
    if image_only:
        instruction += "\n공식 텍스트가 없으므로 '이미지에서는'으로 시작하고 관찰된 표현만 쓰세요. 공식 철학·추구미로 단정하지 마세요."
    if not image_count:
        instruction += '\n분석한 이미지가 없으므로 실제 사진·이미지를 관찰했다고 쓰지 마세요.'
    attempts = []
    payload = dict(task)
    for attempt in range(1, 3):
        final = client.responses.create(
            model=model, instructions=instruction,
            input='다음 데이터를 바탕으로 유효한 JSON 객체를 반환하세요.\n' + json.dumps(payload, ensure_ascii=False),
            text={'format': {'type': 'json_object'}}, max_output_tokens=1000,
        )
        try:
            result = json.loads(final.output_text)
            description = result.get('final_description') if isinstance(result, dict) else None
            issues = description_issues(description, image_only, bool(image_count))
        except (TypeError, ValueError):
            description = None
            issues = ['유효한 JSON 설명을 반환해야 합니다.']
        attempts.append({'attempt': attempt, 'description': description, 'issues': issues})
        if not issues:
            return description, {'passed': True, 'attempts': attempts, 'regenerated': attempt > 1,
                                 'policy': 'existing_exclusions_and_evidence_mode'}
        payload['quality_feedback'] = {
            'issues': issues,
            'instruction': '단어만 삭제하지 말고 위의 원래 근거로 설명을 다시 작성하세요. 새 특징을 추측하지 마세요.',
        }
    raise ValueError('브랜드 설명이 제외 지침·형식 검사를 통과하지 못했습니다: ' + '; '.join(issues))
