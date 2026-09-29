import {z} from 'zod';
import {classificationGroups} from './article-classification';
const allowed=new Set(classificationGroups.flatMap(g=>g.values.map(v=>`${g.label}:${v}`)));
export const filterConditionsSchema=z.object({
 feedId:z.string().min(1).max(100).nullable().default(null),
 category:z.string().min(1).max(100).nullable().default(null),
 view:z.enum(['feeds','starred','later']).default('feeds'),
 readFilter:z.enum(['all','read','unread']).default('all'),
 search:z.string().trim().max(500).default(''),
 classifications:z.array(z.string().refine(v=>allowed.has(v))).max(3).default([]),
}).refine(s=>!s.feedId||!s.category,'フィードとカテゴリは同時指定できません').refine(s=>new Set(s.classifications.map(c=>c.split(':')[0])).size===s.classifications.length,'分類は各軸1つまでです');
export const savedFilterSchema=z.object({name:z.string().trim().min(1).max(40),conditions:filterConditionsSchema});
export type FilterConditions=z.infer<typeof filterConditionsSchema>;
export type SavedFilter={id:string;name:string;conditions:FilterConditions};
