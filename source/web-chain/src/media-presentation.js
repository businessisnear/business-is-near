// Display only: original scopes, observations, hashes and receipts stay literal.
import {t,validateLocale} from './localization.js';
export function mediaEvidencePresentation(payload,locale='en'){
 validateLocale(locale);const receipt=payload?.media?.receipt;
 if(!receipt)return '';
 const parts=[t('Source asset SHA-256',locale)+' '+receipt.source_asset_sha256];
 if(payload.generation?.mode==='near_ai_cloud_unattested'){
  parts.push(t('NEAR AI provider media observations',locale),t('Provider billing and TEE are unverified.',locale),
   t('Authorized reservation: {value} USD nanos.',locale,{value:receipt.reserved_nanos}),
   t('Estimated provider cost: {value} USD nanos.',locale,{value:receipt.estimated_provider_nanos??t('Unknown',locale)}),
   t('Actual provider charge is unknown.',locale));
 }else{
  parts.push(t(receipt.task==='transcribe_short_audio_v1'?'Local Gemma audio transcript':'Local Gemma image observations',locale),
   t('Local compute cost is unknown; no NEAR AI Cloud request or billing verification is claimed.',locale));
 }
 return parts.join(' · ');
}
