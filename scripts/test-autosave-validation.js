// Native fetch is available in Node.js 18+

async function testAutosave() {
    console.log('--- Testing Autosave Validation ---');

    const validData = {
        config: {
            startYear: 2024,
            startMonth: 1,
            endYear: 2025,
            endMonth: 12
        },
        viewMode: 'Y'
    };

    const invalidData = {
        config: {
            startYear: "2024", // Wrong type, should be number
            startMonth: 13,    // Invalid month
            endYear: 2025,
            endMonth: 12
        }
    };

    try {
        // Test 1: Valid Data
        console.log('\nTest 1: Sending VALID data...');
        const resValid = await fetch('http://localhost:3000/api/glass-inputs-autosave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validData)
        });

        if (resValid.status === 200) {
            console.log('✅ Success: Valid data accepted.');
        } else {
            console.log(`❌ Fail: Valid data rejected with status ${resValid.status}`);
            console.log(await resValid.text());
        }

        // Test 2: Invalid Data
        console.log('\nTest 2: Sending INVALID data...');
        const resInvalid = await fetch('http://localhost:3000/api/glass-inputs-autosave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invalidData)
        });

        if (resInvalid.status === 400) {
            console.log('✅ Success: Invalid data rejected (400 Bad Request).');
            const error = await resInvalid.json();
            console.log('Error details:', JSON.stringify(error, null, 2));
        } else {
            console.log(`❌ Fail: Invalid data NOT rejected (Status: ${resInvalid.status})`);
        }

    } catch (e) {
        console.error('Test failed with network error:', e);
        console.log('Make sure the Next.js server is running on localhost:3000');
    }
}

testAutosave();
