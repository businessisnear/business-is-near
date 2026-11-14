"""Trusted model response schemas shared by Cloud and the local adapter.

Only the first system instruction selects a fixed application schema. User and
source text never supply a schema or grant operation authority. Semantic
validators remain mandatory after parsing every response.
"""


def output_schema(messages):
    # Select a fixed schema from the application's trusted system instruction,
    # never a schema supplied in customer/source text. Validation still runs
    # independently after inference; grammar constraints confer no authority.
    system = messages[0]['content'] if messages and messages[0].get('role') == 'system' else ''
    bounded = lambda length: {'type': 'string', 'minLength': 1, 'maxLength': length}
    if system.startswith('Propose a bounded typed record app for the fixed NEAR public-record template.'):
        from executor.app_generation import output_schema as app_output_schema, GENERAL_PROFILE
        return app_output_schema(GENERAL_PROFILE)
    if system.startswith('Propose bounded public fields for the fixed native intake app template.'):
        from executor.app_generation import output_schema as app_output_schema
        return app_output_schema()
    if system.startswith('Decompose one owner-approved business goal into a bounded dependency graph.'):
        from executor.goal_plan import output_schema as goal_output_schema
        return goal_output_schema()
    if system.startswith('Create a private business draft for the given operation.'):
        return {'type': 'object', 'additionalProperties': False,
                'required': ['title', 'summary', 'items'],
                'properties': {'title': bounded(160), 'summary': bounded(600),
                               'items': {'type': 'array', 'minItems': 1, 'maxItems': 4,
                                         'items': {'type': 'object', 'additionalProperties': False,
                                                   'required': ['text', 'source_ids'],
                                                   'properties': {'text': bounded(300), 'source_ids': {
                                                       'type': 'array', 'minItems': 1, 'maxItems': 4,
                                                       'items': bounded(24)}}}}}}
    if system.startswith('Select exactly one owner-approved menu choice'):
        return {'type': 'object', 'additionalProperties': False, 'required': ['choice', 'reason'],
                'properties': {'choice': {'type': 'integer', 'minimum': 0, 'maximum': 3}, 'reason': bounded(300)}}
    if system.startswith('Repair the approved Python source'):
        return {'type': 'object', 'additionalProperties': False, 'required': ['edits', 'reason'],
                'properties': {'reason': bounded(300), 'edits': {'type': 'array', 'minItems': 1, 'maxItems': 4,
                    'items': {'type': 'object', 'additionalProperties': False, 'required': ['path', 'old', 'new'],
                              'properties': {'path': bounded(120), 'old': bounded(1200), 'new': bounded(1200)}}}}}
    if system.startswith('Repair the approved web source'):
        return {'type': 'object', 'additionalProperties': False, 'required': ['edits', 'reason'],
                'properties': {'reason': bounded(300), 'edits': {'type': 'array', 'minItems': 1, 'maxItems': 4,
                    'items': {'type': 'object', 'additionalProperties': False, 'required': ['path', 'old', 'new'],
                              'properties': {'path': bounded(120), 'old': bounded(2000), 'new': bounded(2000)}}}}}
    return 'json'


def response_format(messages):
    """Return the standard Chat Completions format for the trusted schema."""
    schema = output_schema(messages)
    if schema == 'json':
        return {'type': 'json_object'}
    return {'type': 'json_schema', 'json_schema': {
        'name': 'business_response', 'strict': True, 'schema': schema}}
