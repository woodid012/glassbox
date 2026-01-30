import http from 'http'
const port = process.argv[2] || 3000
console.log(`Comparing model results via http://localhost:${port}/api/compare-migration ...`)
http.get(`http://localhost:${port}/api/compare-migration`, (res) => {
    const chunks = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        if (res.statusCode !== 200) {
            console.log(`ERROR ${res.statusCode}:`, body.substring(0, 1000))
            return
        }
        const data = JSON.parse(body)

        console.log(`\nOld model: ${data.oldCalcCount} calcs, ${data.oldModCount} module outputs`)
        console.log(`New model: ${data.newCalcCount} calcs, ${data.newModCount} module outputs`)
        console.log(`\n=== Calculation Differences ===`)
        console.log(`Compared: ${data.calcTotalCompared}, Different: ${data.calcDiffCount}`)
        if (data.calcDiffs.length > 0) {
            for (const d of data.calcDiffs) {
                if (d.issue) { console.log(`  ${d.ref}: ${d.issue}`); continue }
                console.log(`  ${d.ref}: diff=${d.maxDiff} at period ${d.period} (old=${d.oldVal}, new=${d.newVal})`)
            }
        }

        console.log(`\n=== Module Output Differences ===`)
        console.log(`Compared: ${data.modTotalCompared}, Different: ${data.modDiffCount}`)
        if (data.modDiffs.length > 0) {
            for (const d of data.modDiffs) {
                if (d.issue) { console.log(`  ${d.ref}${d.rRef ? ' (→'+d.rRef+')' : ''}: ${d.issue}`); continue }
                console.log(`  ${d.ref}${d.rRef ? ' (→'+d.rRef+')' : ''}: diff=${d.maxDiff} at period ${d.period} (old=${d.oldVal}, new=${d.newVal})`)
            }
        }
    })
}).on('error', (e) => console.log('Connection error:', e.message))
