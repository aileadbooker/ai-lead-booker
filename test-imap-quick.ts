import * as imaps from 'imap-simple';
import dotenv from 'dotenv';
dotenv.config();

async function testIMAP() {
    console.log('Testing IMAP connection...');
    console.log('Host:', process.env.IMAP_HOST);
    console.log('Port:', process.env.IMAP_PORT);
    console.log('User:', process.env.IMAP_USER);

    const config = {
        imap: {
            user: process.env.IMAP_USER!,
            password: process.env.IMAP_PASS!,
            host: process.env.IMAP_HOST!,
            port: parseInt(process.env.IMAP_PORT || '993'),
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 10000,
        },
    };

    try {
        console.log('Connecting...');
        const connection = await imaps.connect(config);
        console.log('✅ Connected!');

        console.log('Opening INBOX...');
        await connection.openBox('INBOX');
        console.log('✅ INBOX opened!');

        console.log('Searching for UNSEEN messages...');
        const messages = await connection.search(['UNSEEN'], {});
        console.log(`✅ Found ${messages.length} unread messages`);

        connection.end();
        console.log('✅ Test complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testIMAP();
