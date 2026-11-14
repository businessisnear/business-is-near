"""Offline requirements audit; no runtime/provider/chain/signing side effects."""
import argparse
import json
from pathlib import Path
from acceptance_scope import native_audit, native_structure, selection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--structure-only', action='store_true',
                        help='Check only the44-ID baseline/catalogue/hash link; no feature acceptance.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        selected = selection(root)
        result = native_structure(root, selected) if args.structure_only else native_audit(root, selected)
        print(json.dumps(result, indent=2))
        return 0 if args.structure_only or result['selected_target_complete'] else 2
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(json.dumps({'verified': False, 'feature_completion_claimed': False,
                          'error': str(error), 'historical_evidence_not_relabelled': True}, indent=2))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
