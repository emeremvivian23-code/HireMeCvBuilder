import { supabase } from './supabase-client';
import { GeneratedCV, GeneratedResume, GeneratedCoverLetter, TabId } from './types';

export type ActivityType = TabId;

export interface ActivityRecord {
  id: string;
  type: ActivityType;
  title: string;
  createdAt: string;
  downloads: number;
  lastDownloadedAt: string | null;
}

interface ActivityRow {
  id: string;
  type: ActivityType;
  title: string;
  downloads: number;
  last_downloaded_at: string | null;
  created_at: string;
}

const ACTIVITY_LIMIT = 100;

function toRecord(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    createdAt: row.created_at,
    downloads: row.downloads,
    lastDownloadedAt: row.last_downloaded_at,
  };
}

export async function fetchActivities(): Promise<ActivityRecord[]> {
  const { data, error } = await supabase
    .from('user_activities')
    .select('id, type, title, downloads, last_downloaded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toRecord(row as ActivityRow));
}

export async function recordActivity(
  type: ActivityType,
  title: string,
  doc: GeneratedCV | GeneratedResume | GeneratedCoverLetter
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('user_activities')
    .insert({ type, title: title || doc.fullName || `${type} document` })
    .select('id')
    .single();
  if (error || !data) {
    console.warn('Could not save activity', error?.message);
    return undefined;
  }
  return data.id as string;
}

export async function incrementDownloadCount(activityId: string): Promise<void> {
  const { error } = await supabase.rpc('record_activity_download', { p_activity_id: activityId });
  if (error) console.warn('Could not record download', error.message);
}

export async function clearActivities(): Promise<void> {
  const { error } = await supabase.from('user_activities').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);
}
