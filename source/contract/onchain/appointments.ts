import { NearBindgen, near, call, view, initialize, assert, NearPromise, validateAccountId } from 'near-sdk-js';

// Experimental native-NEAR appointments. Public UTC/booking metadata only.
// Customers acknowledge service before escrow becomes owner-withdrawable earned
// revenue. No card processor, external calendar, dispute oracle or public deploy.
type Slot = { id:string; start_at:string; end_at:string; deposit_yocto:string; location:string; enabled:boolean; booking_id:string };
type Booking = { id:string; slot_id:string; customer:string; start_at:string; end_at:string; location:string; deposit_yocto:string; storage_contribution:string; cancellation_deadline:string; status:string; refund_attempt:number };
type Withdrawal = { id:string; amount:string; status:string; attempt:number };
const textAmount = (value:string):bigint => {assert(typeof value==='string' && /^(0|[1-9][0-9]{0,38})$/.test(value),'invalid decimal amount');const result=BigInt(value);assert(result<=(1n<<128n)-1n,'amount exceeds u128');return result;};
const decimal = (value:bigint):string => value.toString();
const STORAGE_BYTES = 8192n;
const CUSHION_BYTES = 32768n;
const CALLBACK_GAS = 50000000000000n;
const MAX_PRICE = ((1n<<128n)-1n)/256n;
const ACTIVE = ['reserved','confirmed','refunding','refund_failed'];

@NearBindgen({requireInit:true})
class Appointments {
  owner=''; service_name=''; cancellation_notice_seconds=0; frozen=false;
  slot_ids:string[]=[]; booking_ids:string[]=[]; withdrawal_ids:string[]=[]; backing_ids:string[]=[];
  escrow='0'; earned_balance='0'; earned_total='0'; refunded_total='0'; withdrawn_total='0'; withdrawing='0';
  storage_collected='0'; backing_funded='0'; sequence=0;

  private id(value:string) {assert(typeof value==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) && !['__proto__','prototype','constructor'].includes(value),'invalid public ID');}
  private ownerOnly() {assert(near.predecessorAccountId()===this.owner,'owner only');}
  private live() {assert(!this.frozen,'appointments frozen');}
  private now():bigint {return near.blockTimestamp()/1000000000n;}
  private seconds(value:string):bigint {const parsed=textAmount(value);assert(parsed<=18446744073n,'invalid UTC seconds');return parsed;}
  private boundedText(value:string,max:number) {assert(typeof value==='string' && value.trim().length>0 && value.length<=max,'invalid public text');for(let i=0;i<value.length;i++)assert(value.charCodeAt(i)>=32 && value.charCodeAt(i)!==127,'public text has control characters');}
  private readSlot(id:string):Slot|null {this.id(id);const raw=near.storageRead('appointments:slot:'+id);return raw===null?null:JSON.parse(raw);}
  private saveSlot(slot:Slot) {near.storageWrite('appointments:slot:'+slot.id,JSON.stringify(slot));}
  private readBooking(id:string):Booking|null {this.id(id);const raw=near.storageRead('appointments:booking:'+id);return raw===null?null:JSON.parse(raw);}
  private saveBooking(booking:Booking) {near.storageWrite('appointments:booking:'+booking.id,JSON.stringify(booking));}
  private readWithdrawal(id:string):Withdrawal|null {this.id(id);const raw=near.storageRead('appointments:withdrawal:'+id);return raw===null?null:JSON.parse(raw);}
  private saveWithdrawal(value:Withdrawal) {near.storageWrite('appointments:withdrawal:'+value.id,JSON.stringify(value));}
  private event(id:string,type:string) {assert(Number.isSafeInteger(this.sequence) && this.sequence<Number.MAX_SAFE_INTEGER,'sequence exhausted');this.sequence++;near.log(JSON.stringify({standard:'proofwork_appointments',version:'1.0.0',event:type,data:{id,sequence:this.sequence}}));}
  private pagination(from_index:number,limit:number) {assert(Number.isSafeInteger(from_index) && from_index>=0 && Number.isSafeInteger(limit) && limit>=1 && limit<=20,'invalid pagination');}
  private requiredBalance():bigint {return textAmount(this.escrow)+textAmount(this.earned_balance)+textAmount(this.storage_collected)+(near.storageUsage()+CUSHION_BYTES)*near.storageByteCost();}
  private solvent() {assert(near.accountBalance()>=this.requiredBalance(),'insufficient separate storage/gas backing');}
  private available(slot:Slot):{available:boolean;reason:string} {
    if(this.frozen)return {available:false,reason:'frozen'};
    if(!slot.enabled)return {available:false,reason:'disabled'};
    if(this.now()>=this.seconds(slot.start_at))return {available:false,reason:'started'};
    for(const id of this.slot_ids){const other=this.readSlot(id);if(!other.booking_id)continue;const booking=this.readBooking(other.booking_id);if(booking && ACTIVE.includes(booking.status) && this.seconds(slot.start_at)<this.seconds(booking.end_at) && this.seconds(booking.start_at)<this.seconds(slot.end_at))return {available:false,reason:'overlap'};}
    return {available:true,reason:'available'};
  }
  private deadline(slot:Slot):string {const start=this.seconds(slot.start_at),notice=BigInt(this.cancellation_notice_seconds);return decimal(start>notice?start-notice:0n);}

  @initialize({}) init({service_name,cancellation_notice_seconds}:{service_name:string,cancellation_notice_seconds:number}) {
    this.owner=near.predecessorAccountId();assert(validateAccountId(this.owner),'valid owner required');this.boundedText(service_name,100);
    assert(Number.isSafeInteger(cancellation_notice_seconds) && cancellation_notice_seconds>=0 && cancellation_notice_seconds<=604800,'invalid cancellation notice');
    this.service_name=service_name;this.cancellation_notice_seconds=cancellation_notice_seconds;this.solvent();
  }
  @call({}) set_freeze({frozen}:{frozen:boolean}) {this.ownerOnly();assert(typeof frozen==='boolean','boolean required');this.frozen=frozen;this.event('',frozen?'frozen':'resumed');this.solvent();}
  @call({payableFunction:true}) fund_backing({id}:{id:string}) {this.ownerOnly();this.id(id);assert(this.backing_ids.length<128 && !this.backing_ids.includes(id),'new bounded backing ID required');const value=near.attachedDeposit();assert(value>0n,'backing deposit required');this.backing_ids.push(id);this.backing_funded=decimal(textAmount(this.backing_funded)+value);this.event(id,'backing_funded');this.solvent();}
  @call({}) publish_slot({id,start_at,end_at,deposit_yocto,location}:{id:string,start_at:string,end_at:string,deposit_yocto:string,location:string}) {
    this.ownerOnly();this.live();this.id(id);assert(this.slot_ids.length<128 && this.readSlot(id)===null,'new bounded slot ID required');
    const start=this.seconds(start_at),end=this.seconds(end_at),now=this.now();assert(start>now && start<=now+31622400n && end>start && end-start>=60n && end-start<=28800n,'invalid future UTC interval');assert(textAmount(deposit_yocto)>0n && textAmount(deposit_yocto)<=MAX_PRICE,'positive bounded deposit required');this.boundedText(location,200);
    const slot={id,start_at,end_at,deposit_yocto,location,enabled:true,booking_id:''};this.slot_ids.push(id);this.saveSlot(slot);this.event(id,'slot_published');this.solvent();
  }
  @call({}) set_slot_enabled({id,enabled}:{id:string,enabled:boolean}) {this.ownerOnly();assert(typeof enabled==='boolean','boolean required');const slot=this.readSlot(id);assert(slot,'unknown slot');slot.enabled=enabled;this.saveSlot(slot);this.event(id,enabled?'slot_enabled':'slot_disabled');this.solvent();}
  @view({}) slot({id}:{id:string}) {const slot=this.readSlot(id);if(!slot)return null;const booking=slot.booking_id?this.readBooking(slot.booking_id):null;return {...slot,...this.available(slot),booking_status:booking?booking.status:null,customer:booking?booking.customer:null,cancellation_deadline:this.deadline(slot)};}
  @view({}) slots({from_index=0,limit=10}:{from_index?:number,limit?:number}={}) {this.pagination(from_index,limit);const ids=this.slot_ids.slice(from_index,from_index+limit);return {items:ids.map(id=>this.slot({id})),next_index:from_index+ids.length<this.slot_ids.length?from_index+ids.length:null,observed_at:decimal(this.now()),timezone:'UTC'};}
  @view({}) quote({slot_id}:{slot_id:string}) {const slot=this.readSlot(slot_id);assert(slot,'unknown slot');const storage=near.storageByteCost()*STORAGE_BYTES;return {slot_id,...this.available(slot),deposit_yocto:slot.deposit_yocto,storage_contribution:decimal(storage),total_attached:decimal(textAmount(slot.deposit_yocto)+storage),cancellation_deadline:this.deadline(slot),start_at:slot.start_at,end_at:slot.end_at,location:slot.location,storage_bytes:decimal(STORAGE_BYTES),storage_byte_cost:decimal(near.storageByteCost()),observed_at:decimal(this.now()),timezone:'UTC'};}
  @view({}) booking({id}:{id:string}) {return this.readBooking(id);}
  @view({}) bookings({customer_id,from_index=0,limit=10}:{customer_id?:string,from_index?:number,limit?:number}={}) {this.pagination(from_index,limit);if(customer_id!==undefined)assert(typeof customer_id==='string' && validateAccountId(customer_id),'valid customer account required');const ids=customer_id===undefined?this.booking_ids:this.booking_ids.filter(id=>this.readBooking(id).customer===customer_id);const selected=ids.slice(from_index,from_index+limit);return {items:selected.map(id=>this.readBooking(id)),next_index:from_index+selected.length<ids.length?from_index+selected.length:null};}

  @call({payableFunction:true}) book({id,slot_id,approved_deposit,approved_storage,approved_cancellation_deadline}:{id:string,slot_id:string,approved_deposit:string,approved_storage:string,approved_cancellation_deadline:string}) {
    this.live();this.id(id);assert(this.readBooking(id)===null,'booking ID already exists; inspect it before another payment');assert(this.booking_ids.length<256,'booking capacity exhausted');
    const slot=this.readSlot(slot_id);assert(slot,'unknown slot');const quote=this.quote({slot_id});assert(quote.available,'slot unavailable: '+quote.reason);
    assert(approved_deposit===quote.deposit_yocto && approved_storage===quote.storage_contribution && approved_cancellation_deadline===quote.cancellation_deadline,'appointment quote changed');assert(near.attachedDeposit()===textAmount(quote.total_attached),'exact appointment quote required');
    const booking:Booking={id,slot_id,customer:near.predecessorAccountId(),start_at:slot.start_at,end_at:slot.end_at,location:slot.location,deposit_yocto:slot.deposit_yocto,storage_contribution:quote.storage_contribution,cancellation_deadline:quote.cancellation_deadline,status:'reserved',refund_attempt:0};
    this.booking_ids.push(id);this.saveBooking(booking);slot.booking_id=id;this.saveSlot(slot);this.escrow=decimal(textAmount(this.escrow)+textAmount(slot.deposit_yocto));this.storage_collected=decimal(textAmount(this.storage_collected)+textAmount(quote.storage_contribution));this.event(id,'reserved');this.solvent();return booking;
  }
  @call({}) confirm({id}:{id:string}) {this.ownerOnly();this.live();const booking=this.readBooking(id);assert(booking,'unknown booking');if(booking.status==='confirmed')return {duplicate:true,status:'confirmed'};assert(booking.status==='reserved' && this.now()<this.seconds(booking.end_at),'reservation not confirmable');booking.status='confirmed';this.saveBooking(booking);this.event(id,'confirmed');this.solvent();return {duplicate:false,status:'confirmed'};}
  @call({}) settle({id}:{id:string}) {this.live();const booking=this.readBooking(id);assert(booking && near.predecessorAccountId()===booking.customer,'original customer only');if(booking.status==='settled')return {duplicate:true,status:'settled'};assert(booking.status==='confirmed' && this.now()>=this.seconds(booking.end_at),'confirmed service must have ended');booking.status='settled';this.saveBooking(booking);this.escrow=decimal(textAmount(this.escrow)-textAmount(booking.deposit_yocto));this.earned_balance=decimal(textAmount(this.earned_balance)+textAmount(booking.deposit_yocto));this.earned_total=decimal(textAmount(this.earned_total)+textAmount(booking.deposit_yocto));this.event(id,'customer_settled');this.solvent();return {duplicate:false,status:'settled'};}
  private beginRefund(booking:Booking) {assert(booking.refund_attempt<1000000,'refund attempt capacity exhausted');booking.refund_attempt++;booking.status='refunding';this.saveBooking(booking);this.event(booking.id,'refund_pending');this.solvent();return NearPromise.new(booking.customer).transfer(textAmount(booking.deposit_yocto)).then(NearPromise.new(near.currentAccountId()).functionCall('on_refund',JSON.stringify({id:booking.id,attempt:booking.refund_attempt}),0n,CALLBACK_GAS));}
  @call({}) cancel({id}:{id:string}) {const booking=this.readBooking(id);assert(booking,'unknown booking');const actor=near.predecessorAccountId();assert(actor===this.owner || actor===booking.customer,'owner or original customer only');if(booking.status==='refunded')return {duplicate:true,status:'refunded'};assert(booking.status==='reserved' || booking.status==='confirmed','booking is not cancellable');assert(actor===this.owner || this.now()<=this.seconds(booking.cancellation_deadline),'customer cancellation deadline passed');return this.beginRefund(booking);}
  @call({}) retry_refund({id}:{id:string}) {const booking=this.readBooking(id);assert(booking && (near.predecessorAccountId()===this.owner || near.predecessorAccountId()===booking.customer),'owner or original customer only');assert(booking.status==='refund_failed','only a known failed refund may retry');return this.beginRefund(booking);}
  @call({privateFunction:true}) on_refund({id,attempt}:{id:string,attempt:number}) {const booking=this.readBooking(id);assert(booking && booking.status==='refunding' && booking.refund_attempt===attempt,'refund callback does not match pending attempt');let succeeded=true;try{near.promiseResult(0n);}catch(_){succeeded=false;}if(succeeded){booking.status='refunded';this.escrow=decimal(textAmount(this.escrow)-textAmount(booking.deposit_yocto));this.refunded_total=decimal(textAmount(this.refunded_total)+textAmount(booking.deposit_yocto));const slot=this.readSlot(booking.slot_id);if(slot.booking_id===id){slot.booking_id='';this.saveSlot(slot);}}else booking.status='refund_failed';this.saveBooking(booking);this.event(id,succeeded?'refunded':'refund_failed');}

  private beginWithdrawal(value:Withdrawal) {assert(value.attempt<1000000 && textAmount(this.withdrawing)===0n,'withdrawal already pending or exhausted');assert(textAmount(value.amount)>0n && textAmount(value.amount)<=textAmount(this.earned_balance),'only earned revenue may be withdrawn');value.attempt++;value.status='withdrawing';this.withdrawing=value.amount;this.saveWithdrawal(value);this.event(value.id,'withdraw_pending');this.solvent();return NearPromise.new(this.owner).transfer(textAmount(value.amount)).then(NearPromise.new(near.currentAccountId()).functionCall('on_withdraw',JSON.stringify({id:value.id,attempt:value.attempt}),0n,CALLBACK_GAS));}
  @call({}) withdraw({id,amount}:{id:string,amount:string}) {this.ownerOnly();this.live();this.id(id);const old=this.readWithdrawal(id);if(old){assert(old.amount===amount,'withdrawal ID conflict');assert(old.status==='withdrawn','existing withdrawal unresolved; inspect or explicitly retry known failure');return {duplicate:true,status:'withdrawn'};}assert(this.withdrawal_ids.length<128,'withdrawal capacity exhausted');textAmount(amount);const value={id,amount,status:'new',attempt:0};this.withdrawal_ids.push(id);return this.beginWithdrawal(value);}
  @call({}) retry_withdraw({id}:{id:string}) {this.ownerOnly();this.live();const value=this.readWithdrawal(id);assert(value && value.status==='withdraw_failed','only a known failed withdrawal may retry');return this.beginWithdrawal(value);}
  // Callbacks record the observed transfer even if the conservative backing
  // cushion has since fallen. Future mutations still fail closed until topped
  // up; a post-transfer cushion assertion must not erase a successful payment.
  @call({privateFunction:true}) on_withdraw({id,attempt}:{id:string,attempt:number}) {const value=this.readWithdrawal(id);assert(value && value.status==='withdrawing' && value.attempt===attempt && this.withdrawing===value.amount,'withdraw callback does not match pending attempt');let succeeded=true;try{near.promiseResult(0n);}catch(_){succeeded=false;}if(succeeded){value.status='withdrawn';this.earned_balance=decimal(textAmount(this.earned_balance)-textAmount(value.amount));this.withdrawn_total=decimal(textAmount(this.withdrawn_total)+textAmount(value.amount));}else value.status='withdraw_failed';this.withdrawing='0';this.saveWithdrawal(value);this.event(id,succeeded?'withdrawn':'withdraw_failed');}
  @view({}) withdrawal({id}:{id:string}) {return this.readWithdrawal(id);}
  @view({}) solvency() {const balance=near.accountBalance(),required=this.requiredBalance();return {account_balance:decimal(balance),protected_escrow:this.escrow,earned_balance:this.earned_balance,nonwithdrawable_storage:this.storage_collected,storage_usage_bytes:decimal(near.storageUsage()),storage_byte_cost:decimal(near.storageByteCost()),cushion_bytes:decimal(CUSHION_BYTES),required_balance:decimal(required),surplus:decimal(balance>required?balance-required:0n),shortfall:decimal(required>balance?required-balance:0n)};}
  @view({}) state() {return {owner:this.owner,service_name:this.service_name,cancellation_notice_seconds:this.cancellation_notice_seconds,frozen:this.frozen,timezone:'UTC',observed_at:decimal(this.now()),slot_count:this.slot_ids.length,slot_limit:128,booking_count:this.booking_ids.length,booking_limit:256,escrow:this.escrow,earned_balance:this.earned_balance,earned_total:this.earned_total,refunded_total:this.refunded_total,withdrawn_total:this.withdrawn_total,withdrawing:this.withdrawing,storage_collected:this.storage_collected,backing_funded:this.backing_funded,sequence:this.sequence,settlement:'original_customer_after_confirmed_service_end',private_customer_details:false};}
}
