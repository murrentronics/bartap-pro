# notify-pending-payment

Supabase Edge Function that sends an email alert to the admin when a new pending billing payment is submitted.

## Setup

### 1. Deploy the function
```bash
supabase functions deploy notify-pending-payment
```

### 2. Set the Resend API key secret
Get a free API key from https://resend.com, then:
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
```

### 3. Verify your sender domain in Resend
The function sends from `noreply@bartendaz.app`. You need to verify this domain in your Resend dashboard,
or change the `from` address to use Resend's default: `onboarding@resend.dev` (for testing only).

### 4. Create a Database Webhook in Supabase
In the Supabase dashboard → Database → Webhooks → Create a new webhook:

- **Name**: `notify-pending-payment`
- **Table**: `billing_payments`
- **Events**: `INSERT`
- **Type**: Supabase Edge Functions
- **Edge Function**: `notify-pending-payment`

This will call the function every time a new row is inserted into `billing_payments`.
The function checks if `status === 'pending'` and only sends an email in that case.

## Email content
The email sent to `theronmurren@gmail.com` includes:
- Owner username
- Owner phone number
- Owner address
- Payment amount
- Reference number
- Submission timestamp
