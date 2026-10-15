import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import type { Notifier } from './notifier';

export type Bucket = ReturnType<Storage['bucket']>;

export interface Deps { db: Firestore; bucket: Bucket; notifier: Notifier; now: () => number }
