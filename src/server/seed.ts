import "server-only";
import { randomUUID } from "node:crypto";
import { fromZonedTime,formatInTimeZone } from "date-fns-tz";
import { localDb,createLocalUser,localRpc } from "./local-db";

export const demoAccounts=[
  {email:"meera@carerelay.demo",name:"Meera Sharma",role:"owner"},
  {email:"ananya@carerelay.demo",name:"Ananya Sharma",role:"coordinator"},
  {email:"arjun@carerelay.demo",name:"Arjun Sharma",role:"caretaker"},
  {email:"priya@carerelay.demo",name:"Priya Sharma",role:"viewer"},
] as const;

export async function seedLocal(password:string) {
  const db=await localDb();
  const existing=await db.query<{id:string}>("select id from users where email=$1",[demoAccounts[0].email]);
  if(existing.rows.length) return {created:false,message:"Demo accounts already exist; existing data was preserved."};
  const users=[];
  for(const acc of demoAccounts) users.push(await createLocalUser(acc.email,acc.name,password));
  const owner=users[0];
  const profile=await localRpc<{id:string}>(owner.id,"care_action",[null,"create_profile",{preferred_name:"Meera",timezone:"Asia/Kolkata",date_of_birth:"1952-03-18",notes:"Fictional demonstration profile. Prefers a calm morning routine and taking part in her own care decisions."}]);
  const members:Record<string,string>={};
  const initial=await db.query<{id:string}>("select id from care_members where profile_id=$1 and user_id=$2",[profile.id,owner.id]);
  members.owner=initial.rows[0].id;
  for(let i=1;i<users.length;i++) {
    const invite=await localRpc<{code:string}>(owner.id,"care_action",[profile.id,"invite",{role:demoAccounts[i].role,can_invite:i===1}]);
    await localRpc(users[i].id,"care_action",[null,"join",{code:invite.code}]);
    const member=await db.query<{id:string}>("select id from care_members where profile_id=$1 and user_id=$2",[profile.id,users[i].id]);
    members[demoAccounts[i].role]=member.rows[0].id;
  }
  const today=formatInTimeZone(new Date(),"Asia/Kolkata","yyyy-MM-dd");
  const start=new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate()-30);
  const base={strength:"",dosage:"1 tablet",form:"tablet",route:"Oral",instructions:"Follow the recorded prescription instructions.",source:"Fictional clinician prescription — demonstration only",start_date:start.toISOString().slice(0,10),end_date:null,times:["08:00"],days:[0,1,2,3,4,5,6],reminder_minutes:15,reminders_enabled:true,responsible_member_id:members.coordinator};
  const meds=[];
  for(const item of [
    {name:"Amlodipine",strength:"5 mg",instructions:"Take with a glass of water. Recorded from the fictional prescription.",times:["08:00"]},
    {name:"Metformin",strength:"500 mg",instructions:"Take after a meal, as recorded in the fictional prescription.",times:["08:30","20:00"]},
    {name:"Vitamin D3",strength:"1,000 IU",instructions:"Take after breakfast, as recorded in the fictional prescription.",times:["09:00"]},
    {name:"Atorvastatin",strength:"10 mg",instructions:"Take at the recorded evening time. Fictional demonstration instructions.",times:["21:00"]},
  ]) {
    meds.push(await localRpc<{id:string}>(owner.id,"care_action",[profile.id,"save_medication",{...base,...item}]));
  }
  const medRow=await db.query<Record<string,unknown>>("select m.*,s.times,s.days,s.reminder_minutes,s.reminders_enabled from medications m join medication_schedules s on s.medication_id=m.id where m.id=$1",[meds[1].id]);
  const m=medRow.rows[0];
  await localRpc(owner.id,"care_action",[profile.id,"save_medication",{...base,...m,id:m.id,expected_version:1,instructions:"Take after the morning and evening meals, as recorded in the updated fictional prescription.",reason:"Added the meal timing from the fictional discharge note.",source:"Fictional discharge note — Dr. R. Kapoor"}]);
  const at=(time:string)=>fromZonedTime(`${today}T${time}:00`,"Asia/Kolkata").toISOString();
  // Synthetic reports are explicitly seeded, never inferred from a lack of updates.
  await db.query("update dose_events set status='self_reported_taken',reported_by=$1,recorded_at=$2,version=version+1,note='Fictional self-report for demonstration' where medication_id=$3 and scheduled_at=$4",[owner.id,at("08:04"),meds[0].id,at("08:00")]);
  await db.query("update dose_events set status='unconfirmed',version=version+1,note='Status has not yet been updated; this does not mean missed.' where medication_id=$1 and scheduled_at=$2",[meds[2].id,at("09:00")]);
  const pendingDose=await db.query<{id:string}>("select id from dose_events where medication_id=$1 and scheduled_at=$2",[meds[1].id,at("20:00")]);
  await localRpc(users[1].id,"care_action",[profile.id,"handoff",{dose_event_id:pendingDose.rows[0].id,title:"Help with the evening medication",to_member_id:members.caretaker,due_at:at("20:00"),note:"I will be at work this evening. Could you help Meera with her recorded medication routine?"}]);
  const completed=await localRpc<{id:string}>(users[1].id,"care_action",[profile.id,"handoff",{title:"Collect the appointment documents",to_member_id:members.caretaker,due_at:at("10:00"),note:"Please bring the recorded medication list to the next appointment."}]);
  await localRpc(users[2].id,"care_action",[profile.id,"handoff_response",{id:completed.id,accept:true,note:"I can bring the documents.",expected_version:1}]);
  await localRpc(users[2].id,"care_action",[profile.id,"complete_task",{id:completed.id,note:"Documents collected and kept ready.",expected_version:2}]);
  const day=new Date(`${today}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+2);
  const appointmentAt=fromZonedTime(`${day.toISOString().slice(0,10)}T10:30:00`,"Asia/Kolkata").toISOString();
  await localRpc(owner.id,"care_action",[profile.id,"save_appointment",{doctor_name:"Dr. R. Kapoor",specialty:"General medicine",starts_at:appointmentAt,clinic:"Greenview Family Clinic",location:"Fictional clinic — demonstration only",notes:"Routine follow-up. Bring the current recorded medication list.",accompanying_member_id:members.coordinator,status:"upcoming",follow_up_notes:""}]);
  await db.query("insert into audit_logs(id,profile_id,actor_id,actor_name,action,entity_type,entity_id,details,created_at) values($1,$2,$3,$4,'Self-reported a dose as taken','dose',$5,$6,$7)",[randomUUID(),profile.id,owner.id,owner.name,(await db.query<{id:string}>("select id from dose_events where medication_id=$1 and scheduled_at=$2",[meds[0].id,at("08:00")])).rows[0].id,JSON.stringify({medication:"Amlodipine",previous_status:"scheduled",new_status:"self_reported_taken"}),at("08:04")]);
  return {created:true,profileId:profile.id,message:"Synthetic care circle created. Log in using an individual demo account."};
}
