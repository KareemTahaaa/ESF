import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { escapeHtml } from '@/lib/notify/templates';

export async function POST(request: Request) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.error('RESEND_API_KEY is not defined in environment variables');
        return NextResponse.json(
            { error: 'Email service not configured' },
            { status: 500 }
        );
    }

    const resend = new Resend(apiKey);

    try {
        const { firstName, lastName, email, phone, subject, department, message } = await request.json();

        // Basic validation
        if (!firstName || !lastName || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Everything below was typed by a visitor: escape it before it goes into the HTML.
        const e = (v: unknown) => escapeHtml(String(v ?? ''));

        const { data, error } = await resend.emails.send({
            from: 'Egyptian Skating Federation <onboarding@resend.dev>', // Should be updated to a verified domain in production
            to: ['secretariat@egyptskate.org'],
            subject: `New Contact Form Inquiry: ${String(subject).replace(/\s+/g, ' ').slice(0, 150)}`,
            replyTo: email,
            html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${e(firstName)} ${e(lastName)}</p>
        <p><strong>Email:</strong> ${e(email)}</p>
        <p><strong>Phone:</strong> ${e(phone || 'Not provided')}</p>
        <p><strong>Department:</strong> ${e(department || 'General')}</p>
        <p><strong>Subject:</strong> ${e(subject)}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${e(message)}</p>
        <hr />
        <p>Sent from the Egyptian Skating Federation Website</p>
      `,
        });

        if (error) {
            console.error('Resend error:', error);
            return NextResponse.json({ error }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
