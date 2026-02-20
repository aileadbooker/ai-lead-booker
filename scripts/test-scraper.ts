
import scraper from '../src/ingestion/scraper';

async function test() {
    console.log('🧪 Testing Real Web Scraper...');

    try {
        const query = 'Digital Marketing Agencies in New York';
        console.log(`Query: ${query}`);

        const leads = await scraper.findLeads(query, 3);

        console.log('\n✅ Scraper Results:');
        console.log(JSON.stringify(leads, null, 2));

        if (leads.length > 0) {
            console.log('\n🚀 SUCCESS: Found real leads!');
        } else {
            console.log('\n⚠️ WARNING: No leads found. Search blocked or regex failed.');
        }

    } catch (error) {
        console.error('❌ Scraper Failed:', error);
    }
}

test();
