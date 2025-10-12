/**
 * Postmark email client
 * Sends transactional emails via Postmark API
 */
export class EmailClient {
  constructor(apiToken, fromEmail, logger) {
    this.apiToken = apiToken
    this.fromEmail = fromEmail
    this.logger = logger
  }

  /**
   * Send email via Postmark
   * @param {Object} params
   * @param {string} params.to - Recipient email
   * @param {string} params.subject - Email subject
   * @param {string} params.textBody - Plain text body
   * @param {string} [params.htmlBody] - HTML body (optional)
   * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
   */
  async send({ to, subject, textBody, htmlBody }) {
    try {
      this.logger.info({
        message: 'Sending email',
        to,
        subject,
        provider: 'postmark',
      })

      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.apiToken,
        },
        body: JSON.stringify({
          From: this.fromEmail,
          To: to,
          Subject: subject,
          TextBody: textBody,
          HtmlBody: htmlBody,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        this.logger.error({
          message: 'Email send failed',
          to,
          subject,
          error: result.Message || result.ErrorCode,
          statusCode: response.status,
        })
        return {
          ok: false,
          error: result.Message || 'Failed to send email',
        }
      }

      this.logger.info({
        message: 'Email sent successfully',
        to,
        subject,
        messageId: result.MessageID,
      })

      return {
        ok: true,
        messageId: result.MessageID,
      }
    } catch (error) {
      this.logger.error({
        message: 'Email send error',
        to,
        subject,
        error: error.message,
      })
      return {
        ok: false,
        error: error.message,
      }
    }
  }
}

/**
 * Email templates for trial conversion events
 */
export const EmailTemplates = {
  /**
   * Trial reminder - X days remaining
   */
  trialReminder: ({ email, daysRemaining, trialEndDate }) => ({
    subject: `${daysRemaining} days left in your trial`,
    textBody: `Hi there,

Your trial ends in ${daysRemaining} days (${new Date(trialEndDate).toLocaleDateString()}).

To continue using our service without interruption, please:
1. Select a paid plan that fits your needs
2. Add a payment method

Choose your plan now:
https://app.example.com/settings/billing

Questions? Just reply to this email.

Best regards,
The Team`,
  }),

  /**
   * Trial ended - no payment method
   */
  trialEnded: ({ email, trialEndDate }) => ({
    subject: 'Your trial has ended',
    textBody: `Hi there,

Your 14-day trial has ended on ${new Date(trialEndDate).toLocaleDateString()}.

To continue using our service, please select a paid plan and add a payment method:

https://app.example.com/settings/billing

We'd love to have you as a paying customer!

Best regards,
The Team`,
  }),

  /**
   * Payment failed after trial
   */
  paymentFailed: ({ email, amount, retryDate }) => ({
    subject: 'Payment failed - Action required',
    textBody: `Hi there,

We attempted to charge your payment method for $${(amount / 100).toFixed(2)}, but the payment failed.

We'll automatically retry the payment on ${new Date(retryDate).toLocaleDateString()}.

To update your payment method, visit:
https://app.example.com/settings/billing

If all retry attempts fail, your subscription will be canceled.

Best regards,
The Team`,
  }),

  /**
   * Trial converted to paid
   */
  trialConverted: ({ email, planName, amount }) => ({
    subject: 'Welcome to your paid plan!',
    textBody: `Hi there,

Your trial has been successfully converted to the ${planName} plan.

You've been charged $${(amount / 100).toFixed(2)} for your first billing period.

Thank you for choosing us!

View your subscription details:
https://app.example.com/settings/billing

Best regards,
The Team`,
  }),
}
