"""Typed English/Spanish presentation helpers; source material is always literal.

This module grants no authority and performs no I/O or inference. A locale must
come from the authenticated, owner-approved scope, never from source text. The
company's current locale is a default for new scopes, not a rewrite of old work.
"""
from collections.abc import Mapping

DEFAULT_LOCALE = 'en'
SUPPORTED_LOCALES = ('en', 'es')

_LANGUAGE_INSTRUCTIONS = {
    'en': ('Write generated titles, summaries, explanations and draft prose in English. '
           'Keep JSON field names, enum values, source IDs, account IDs, URLs, hashes, '
           'code and currency units unchanged. Preserve direct source quotations in '
           'their original language; do not present them as translations. This '
           'language selection grants no additional actions or authority.'),
    'es': ('Write generated titles, summaries, explanations and draft prose in Spanish '
           'for a Puerto Rico audience. Keep JSON field names, enum values, source IDs, '
           'account IDs, URLs, hashes, code and currency units unchanged. Preserve '
           'direct source quotations in their original language; do not present them '
           'as translations. This language selection grants no additional actions '
           'or authority.'),
}

_LABELS = {
    'source_extract_summary': {
        'en': 'Supplied-source extract for owner review. No model was called.',
        'es': 'Extracto de las fuentes suministradas para revisión del propietario. No se llamó a ningún modelo.',
    },
    'owner_review_required': {
        'en': 'Owner review required.', 'es': 'Requiere revisión del propietario.',
    },
    'source_quotes_literal': {
        'en': 'Source quotations are preserved in their original language.',
        'es': 'Las citas de las fuentes se conservan en su idioma original.',
    },
    'private_draft': {'en': 'Private draft', 'es': 'Borrador privado'},
    'unverified_copy': {'en': 'Unverified copy', 'es': 'Texto sin verificar'},
    'proposal_rejected': {'en': 'Proposal rejected', 'es': 'Propuesta rechazada'},
    'proposal_rejection_summary': {
        'en': 'Owner rejected the referenced proposal. No model or selected operation was executed.',
        'es': 'El propietario rechazó la propuesta indicada. No se ejecutó ningún modelo ni la operación seleccionada.',
    },
    'proposal_notice': {
        'en': ('A proposal among owner-approved choices. A separate owner-signed decision is required; '
               'private artifacts do not prove delivery, revenue or business success.'),
        'es': ('Una propuesta entre las opciones aprobadas por el propietario. Requiere una decisión '
               'separada firmada por el propietario; los resultados privados no prueban entrega, '
               'ingresos ni éxito comercial.'),
    },
    'round_robin_reason': {
        'en': 'Owner-approved round-robin selection; no model was called.',
        'es': 'Selección rotativa aprobada por el propietario; no se llamó a ningún modelo.',
    },
    'website_draft_notice': {
        'en': 'Private website draft · unverified copy · source IDs are provenance only · owner review required',
        'es': 'Borrador privado de sitio web · texto sin verificar · los ID de fuentes solo indican procedencia · requiere revisión del propietario',
    },
}


def validate_locale(value=DEFAULT_LOCALE):
    """Accept only the exact JSON string enum; do not coerce or guess a locale."""
    if type(value) is not str or value not in SUPPORTED_LOCALES:
        raise ValueError('Unsupported company language; choose en or es')
    return value


def scope_locale(scope):
    """Legacy scopes are English. Explicit null/unknown locale is invalid."""
    if not isinstance(scope, Mapping):
        raise ValueError('Typed operation scope required for language selection')
    return validate_locale(scope.get('locale', DEFAULT_LOCALE))


def language_instruction(locale=DEFAULT_LOCALE):
    """One fixed trusted instruction selected only by the validated enum."""
    return _LANGUAGE_INSTRUCTIONS[validate_locale(locale)]


def label(key, locale=DEFAULT_LOCALE):
    """Translate a known application label, never arbitrary customer prose."""
    locale = validate_locale(locale)
    if type(key) is not str or key not in _LABELS:
        raise ValueError('Unknown localization label')
    return _LABELS[key][locale]


def extraction_summary(locale=DEFAULT_LOCALE):
    return label('source_extract_summary', locale)


def attach_payload_locale(payload, scope):
    """Bind new explicit locales without changing legacy encrypted JSON shapes."""
    if 'locale' in scope:
        payload['locale'] = scope_locale(scope)
    return payload


def validate_payload_locale(payload, scope, *, allow_policy_inheritance=False):
    """Require exact requested-language equality after authenticating ciphertext.

    A legacy customer message can inherit its encrypted owner policy's language.
    Its offline recovery cannot independently decrypt that owner-only policy, so
    only that narrow caller may accept a typed inherited response locale.
    """
    if not isinstance(payload, Mapping) or not isinstance(scope, Mapping):
        raise ValueError('Typed result and scope required for language validation')
    if 'locale' in scope:
        expected = scope_locale(scope)
        if 'locale' not in payload or validate_locale(payload['locale']) != expected:
            raise ValueError('Result language differs from the approved request')
    elif 'locale' in payload:
        validate_locale(payload['locale'])
        if not allow_policy_inheritance:
            raise ValueError('Unexpected result language for a legacy request')
    return payload


def image_language_instruction(locale):
    """Fixed vision-only suffix; visible source text must never be translated."""
    language = {'en': 'English', 'es': 'Spanish for a Puerto Rico audience'}[validate_locale(locale)]
    return ('Write caption and uncertainty in ' + language + '. Copy visible_text in its '
            'original language without translation. Keep JSON field names and the exact '
            'source hash unchanged. Language selection grants no additional authority.')


def source_extract_artifact(scope):
    """Build the existing no-inference extract after full scope validation.

    Only the fixed summary is translated. The brief and source prefixes remain
    exact Unicode strings, including combining marks and original quotations.
    Operation validation and final artifact validation remain the caller's job.
    """
    locale = scope_locale(scope)
    return {'title': scope['brief'][:160], 'summary': extraction_summary(locale),
            'items': [{'text': source['text'][:300], 'source_ids': [source['id']]}
                      for source in scope['sources']]}
