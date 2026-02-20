
import imaps from 'imap-simple';
import dotenv from 'dotenv';
dotenv.config();

async function testImap() {
    const config = {
        imap: {
            user: process.env.IMAP_USER || '',
            password: process.env.IMAP_PASS || '',
            host: process.env.IMAP_HOST || '',
            port: parseInt(process.env.IMAP_PORT || '993'),
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            debug: console.log
        }
    };

    console.log('Testing IMAP connection with config:', {
        host: config.imap.host,
        port: config.imap.port,
        user: config.imap.user
    });

    try {
        console.log('Connecting...');
        const connection = await imaps.connect(config);
        console.log('Connected!');

        console.log('Opening INBOX...');
        await connection.openBox('INBOX');
        console.log('INBOX opened!');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: ['HEADER'], markSeen: false };
        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${messages.length} unread messages.`);

        connection.end();
        console.log('Connection closed.');
    } catch (error) {
        console.error('IMAP Error:', error);
    }
}

testImap();
