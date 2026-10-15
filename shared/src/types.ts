export type Role = 'store' | 'avm' | 'am' | 'head_vm' | 'director';
export type Country = 'CZ' | 'SK' | 'RO';
export type Lang = 'en' | 'cs' | 'sk' | 'ro';
export type ZoneState = 'empty' | 'photo_added' | 'not_in_campaign'
  | 'submitted' | 'needs_correction' | 'correction_sent' | 'approved';
export interface Claims { role: Role; country: Country | null; storeId: string | null }
export interface ZoneDef { id: string; name: string }
export interface DepartmentDef { id: string; name: string; zones: ZoneDef[] }
export interface StoreDef { id: string; code: string; name: string; country: Country; timezone: string; departments: DepartmentDef[] }
export interface PhotoRef { path: string; width: number; height: number }
export interface ZoneVersion { n: number; photos: PhotoRef[]; storeComment: string; createdAt: number }
export interface ZoneDoc { id: string; reportId: string; storeId: string; country: Country; departmentId: string; name: string; order: number;
  state: ZoneState; versions: ZoneVersion[]; earliestOpenDeadline: string | null;
  reminderDayBeforeSentFor: string | null; reminderOverdueSentFor: string | null; approvedBy: string | null; approvedAt: number | null }
export interface ZoneSummary { state: ZoneState; deadline: string | null }
export interface ReportDoc { id: string; storeId: string; storeCode: string; storeName: string; country: Country; timezone: string;
  campaignName: string; status: 'draft' | 'sent'; createdAt: number; sentAt: number | null; seenBy: string[];
  zoneSummary: Record<string, ZoneSummary> }
export interface Stroke { points: number[] }   // flat [x0,y0,x1,y1,…], each 0..1 (Firestore forbids nested arrays)
export interface FeedbackDoc { id: string; authorUid: string; authorRole: Role; authorName: string; version: number; photoIndex: number;
  comment: string; strokes: Stroke[]; deadline: string; createdAt: number; status: 'open' | 'answered' }
export interface UserDoc { email: string; role: Role; country: Country | null; storeId: string | null; displayName: string; language: Lang; fcmTokens: string[] }
