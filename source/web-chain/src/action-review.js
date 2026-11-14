// Pure presentation for an already validated intent. This module neither
// authorizes an action nor reads private scope, ciphertext or recovery fields.
import {formatNear} from './chain.js';
import {t,validateLocale,languageName} from './localization.js';

const MAX_SECONDS=18446744073n;
const operations={strategy_plan:'Strategy plan',research_summary:'Research summary',website_build:'Private website draft',content_draft:'Content draft',support_draft:'Support draft',outreach_draft:'Outreach draft',social_draft:'Social draft',ads_draft:'Advertising draft',analytics_report:'Analytics report',engineering_patch:'Code repair'};
function own(value,key){if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Review metadata is unavailable.');const property=Object.getOwnPropertyDescriptor(value,key);if(!property||!Object.hasOwn(property,'value'))throw Error('Review field '+key+' is unavailable.');return property.value;}
function text(value,label,max=200){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error('Invalid '+label+' for review.');return value;}
function id(value,label='request ID'){const result=text(value,label,64);if(!/^[A-Za-z0-9_-]+$/.test(result))throw Error('Invalid '+label+' for review.');return result;}
function account(value,label){const result=text(value,label,64);if(!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(result)||result.length<2)throw Error('Invalid '+label+' for review.');return result;}
function amount(value){return formatNear(value);}
function integer(value,label){if(!Number.isSafeInteger(value)||value<1)throw Error('Invalid '+label+' for review.');return String(value);}
function bool(value){if(typeof value!=='boolean')throw Error('Review requires an explicit state.');return value;}
function seconds(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,10})$/.test(value)||BigInt(value)>MAX_SECONDS)throw Error('Invalid UTC time for review.');return BigInt(value);}
function utc(value){const date=new Date(Number(seconds(value)*1000n));return date.toISOString().replace('T',' ').replace('.000Z',' UTC');}
function start(value){return seconds(value)===0n?'Next eligible cycle':utc(value);}
function commitment(value){if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw Error('Invalid encrypted commitment for review.');return value;}
function operation(value){if(!Object.hasOwn(operations,value))throw Error('Unknown work type for review.');return operations[value];}
function interval(value){integer(value,'repeat interval');for(const [unit,name] of [[86400,'day'],[3600,'hour'],[60,'minute']])if(value%unit===0)return 'Every '+value/unit+' '+name+(value/unit===1?'':'s');return 'Every '+value+' seconds';}
function gas(value){if(typeof value!=='string'||!/^[1-9]\d{0,19}$/.test(value))throw Error('Invalid gas limit for review.');const n=BigInt(value),unit=10n**12n,part=(n%unit).toString().padStart(12,'0').replace(/0+$/,'');return String(n/unit)+(part?'.'+part:'')+' Tgas';}

export function describeAction(intent,context){
 const method=own(intent,'method'),args=own(intent,'args'),signer=account(own(context,'account'),'signing account'),contract=account(own(context,'contract'),'contract account');
 const locale=validateLocale(Object.hasOwn(context,'locale')?own(context,'locale'):'en');
 const get=key=>own(args,key),details={'Attached deposit':amount(own(intent,'deposit')),'Prepaid gas limit':gas(own(intent,'gas'))};let title;
 switch(method){
  case 'company_set_operator':{title='Approve company operator rotation';details['Previous operator']=account(get('expected_operator'),'previous operator');details['New operator']=account(get('operator'),'new operator');details['Required state']='Frozen company; active work archived; escrow, committed and withdrawing balances zero';details['Next separate approvals']='Install reviewed worker encryption profile and grant a restricted key for the new operator before resuming';break;}
  case 'ai_set_media_policy':{
   title='Approve NEAR AI media policy';details['Vision upload calls']=String(bool(get('vision_enabled')));details['Audio upload calls']=String(bool(get('audio_enabled')));const reserve=get('audio_reserve_nanos');if(typeof reserve!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(reserve)||BigInt(reserve)>=2n**128n)throw Error('Exact audio reservation required.');details['Audio reservation (USD nanos)']=reserve;details['Budget']='Shared owner-approved AI counters and caps';details['Provider evidence']='Billing and TEE remain unverified';break;
  }
  case 'company_submit_operation':{
   title='Approve business work';details['Task ID']=id(get('id'));details['Work type']=operation(get('operation'));details['Start']=start(get('not_before'));
   const dependencies=get('dependencies');if(!Array.isArray(dependencies)||dependencies.length>4)throw Error('Invalid dependencies for review.');details['Dependencies']=dependencies.length?dependencies.map(value=>id(value,'dependency ID')).join(', '):'None';details['Encrypted scope commitment']=commitment(get('scope_hash'));break;
  }
  case 'company_create_mandate':{
   title='Approve recurring work';details['Mandate ID']=id(get('id'));details['Start']=start(get('start_at'));details['Expiry (UTC)']=utc(get('expires_at'));details['Repeat interval']=interval(get('interval_seconds'));details['Lifetime run limit']=integer(get('max_runs'),'lifetime run limit');details['Maximum runs per UTC day']=integer(get('max_runs_per_day'),'daily run limit');
   const templates=get('templates');if(!Array.isArray(templates)||templates.length<1||templates.length>4)throw Error('Invalid approved menu for review.');details['Approved work menu']=templates.map(template=>operation(own(template,'operation'))).join(', ');break;
  }
  case 'company_create_inbox':
   title='Authorize customer inbox';details['Inbox ID']=id(get('id'));details['Named customer']=account(get('customer_id'),'named customer');details['Expiry (UTC)']=utc(get('expires_at'));details['Lifetime message limit']=integer(get('max_messages'),'message limit');details['Maximum messages per UTC day']=integer(get('max_messages_per_day'),'daily message limit');details['Encrypted policy commitment']=commitment(own(get('policy'),'scope_hash'));break;
  case 'company_customer_message':
   title='Send encrypted question';details['Message ID']=id(get('id'));details['Inbox ID']=id(get('inbox_id'));details['Encrypted question commitment']=commitment(get('scope_hash'));break;
  case 'company_set_mandate_enabled':{
   const enabled=bool(get('enabled'));title=enabled?'Resume recurring work':'Pause recurring work';details['Mandate ID']=id(get('id'));details['Work authority']=enabled?'Enabled':'Paused';break;
  }
  case 'company_set_inbox_enabled':{
   const enabled=bool(get('enabled'));title=enabled?'Resume customer inbox':'Pause customer inbox';details['Inbox ID']=id(get('id'));details['Message processing']=enabled?'Enabled':'Paused';break;
  }
  case 'company_cancel_operation':
   title='Cancel business work';details['Task ID']=id(get('id'));details['Requested result']='Owner cancellation without a success claim';break;
  case 'company_set_locale':
   title='Change company language';details['Company language']=languageName(validateLocale(get('locale')),locale);details['Existing records']='Keep their approved language and exact bytes';details['New work']='Uses the language captured in its approved scope';break;
  case 'publish_slot':
   title='Publish appointment';details['Slot ID']=id(get('id'));details['Start (UTC)']=utc(get('start_at'));details['End (UTC)']=utc(get('end_at'));details['Customer service deposit']=amount(get('deposit_yocto'));details['Public meeting location']=text(get('location'),'public meeting location');break;
  case 'book':
   title='Reserve appointment';details['Reservation ID']=id(get('id'));details['Slot ID']=id(get('slot_id'));details['Service deposit']=amount(get('approved_deposit'));details['Nonrefundable booking storage']=amount(get('approved_storage'));details['Customer cancellation deadline (UTC)']=seconds(get('approved_cancellation_deadline'))===0n?'No remaining customer cancellation window':utc(get('approved_cancellation_deadline'));break;
  case 'confirm':
   title='Confirm reservation';details['Reservation ID']=id(get('id'));details['Requested state']='Confirmed';break;
  case 'settle':
   title='Acknowledge received service';details['Reservation ID']=id(get('id'));details['Funds effect']='Move the confirmed service deposit from escrow to earned revenue';break;
  case 'cancel':
   title='Cancel reservation and refund deposit';details['Reservation ID']=id(get('id'));details['Refund destination']='Original customer only';details['Refund amount']='Original service deposit from booking escrow';details['Booking storage']='Retained; nonrefundable';break;
  case 'retry_refund':
   title='Retry known failed refund';details['Reservation ID']=id(get('id'));details['Refund destination']='Original customer only';details['Booking storage']='Retained; nonrefundable';break;
  case 'set_slot_enabled':{
   const enabled=bool(get('enabled'));title=enabled?'Enable appointment slot':'Disable appointment slot';details['Slot ID']=id(get('id'));details['Availability']=enabled?'Enabled':'Disabled';break;
  }
  case 'withdraw':
   title='Withdraw earned revenue';details['Withdrawal ID']=id(get('id'));details['Earned amount']=amount(get('amount'));details['Destination']=signer;details['Funding source']='Available earned revenue; customer escrow and storage excluded';break;
  case 'retry_withdraw':
   title='Retry known failed earned withdrawal';details['Withdrawal ID']=id(get('id'));details['Destination']='Original owner only';details['Amount']='Recorded failed withdrawal amount';break;
  case 'set_freeze':{
   const frozen=bool(get('frozen'));title=frozen?'Freeze new operations':'Resume operations';details['Requested state']=frozen?'Frozen':'Active';details['Customer refunds']='Remain available under the existing refund rules';break;
  }
  case 'refund':
   title='Refund unaccepted service';details['Job ID']=id(get('id'));details['Refund destination']='Original customer only';details['Order storage']='Retained; nonrefundable';break;
  default:throw Error('Unsupported action review.');
 }
 // Translate only known presentation fields. IDs, commitments, locations and
 // timestamps remain literal even when they happen to match a catalog key.
 const fixedValues=new Set(['Work type','Work authority','Message processing','Requested result','Requested state','Funds effect','Refund destination','Refund amount','Booking storage','Destination','Amount','Funding source','Availability','Customer refunds','Existing records','New work']);
 for(const key of fixedValues)if(Object.hasOwn(details,key)&&!(key==='Destination'&&details[key]===signer))details[key]=t(details[key],locale);
 if(details.Start==='Next eligible cycle')details.Start=t(details.Start,locale);
 if(method==='company_submit_operation'&&get('dependencies').length===0)details.Dependencies=t('None',locale);
 if(method==='company_create_mandate'){
  details['Approved work menu']=get('templates').map(template=>t(operation(own(template,'operation')),locale)).join(', ');
  const value=get('interval_seconds');let rendered=false;for(const [unit,key] of [[86400,'Every {count} days'],[3600,'Every {count} hours'],[60,'Every {count} minutes']])if(value%unit===0){details['Repeat interval']=locale==='en'?interval(value):t(key,locale,{count:value/unit});rendered=true;break;}if(!rendered)details['Repeat interval']=locale==='en'?interval(value):t('Every {count} seconds',locale,{count:value});
 }
 if(method==='book'&&seconds(get('approved_cancellation_deadline'))===0n)details['Customer cancellation deadline (UTC)']=t('No remaining customer cancellation window',locale);
 return {title:t(title,locale),description:t('{signer} will sign this request for {contract}. Network gas is charged separately.',locale,{signer,contract}),details:Object.fromEntries(Object.entries(details).map(([key,value])=>[t(key,locale),value]))};
}
