export const EMAIL_MESSAGES = {
  SUCCESS: {
    VERIFICATION_SENT: 'Письмо с подтверждением отправлено',
    PASSWORD_RESET_SENT: 'Письмо для сброса пароля отправлено',
  },
  ERROR: {
    SEND_FAILED: 'Ошибка отправки email',
    NOT_CONFIGURED: 'Email сервис не настроен',
  },
  INFO: {
    VERIFICATION_REQUIRED: 'Требуется подтверждение email',
  },
} as const;
