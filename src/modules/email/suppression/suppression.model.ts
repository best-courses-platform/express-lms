import { Schema, model } from 'mongoose';

export type SuppressionReason = 'bounce' | 'complaint';

export interface EmailSuppression {
  email: string;
  reason: SuppressionReason;
  // подтип отказа / тип жалобы из события провайдера — для разбора, почему адрес заблокирован
  detail?: string;
  eventId?: string;
  messageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Список подавления: адреса, на которые письма не отправляются — постоянный отказ (bounce) или
// жалоба на спам (complaint). Провайдер (Postbox) ведёт собственные стоп-листы, но свой нужен,
// чтобы не зависеть от него: не ставить в работу заведомо бесполезную отправку, не вводить
// пользователя в заблуждение и сохранить решение при смене провайдера.
const suppressionSchema = new Schema<EmailSuppression>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: { type: String, enum: ['bounce', 'complaint'], required: true },
    detail: { type: String },
    eventId: { type: String },
    messageId: { type: String },
  },
  { timestamps: true, collection: 'emailsuppressions' }
);

export const EmailSuppressionModel = model<EmailSuppression>('EmailSuppression', suppressionSchema);
