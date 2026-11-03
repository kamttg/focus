import { z } from 'zod';

export const classificationSchema = z.object({
  label: z.enum(['relevant', 'off_topic', 'uncertain']),
  confidence: z.number().finite().min(0).max(1),
  reason: z.string().trim().min(1).max(180)
}).strict();
export type Classification = z.infer<typeof classificationSchema>;
export const uncertain = (reason = 'Não foi possível avaliar esta página.'): Classification =>
  ({ label: 'uncertain', confidence: 0, reason });
export const pageSchema = z.object({
  domain: z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i),
  title: z.string().max(1500),
  description: z.string().max(1500),
  headings: z.array(z.string().max(1500)).max(8),
  excerpt: z.string().max(1500)
}).strict().refine(p => p.title.length + p.description.length + p.headings.join('').length + p.excerpt.length <= 1500,
  'O contexto excede 1500 caracteres');
export type PageContext = z.infer<typeof pageSchema>;
export const requestSchema = z.object({
  goal: z.string().trim().min(3).max(240),
  topics: z.array(z.string().trim().min(1).max(40)).max(8),
  page: pageSchema
}).strict();
export type ClassifyRequest = z.infer<typeof requestSchema>;
