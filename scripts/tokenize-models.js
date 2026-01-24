/**
 * Tokenize model JSON files for LLM consumption
 * Creates compact versions that are faster/cheaper for LLMs to read
 *
 * Run: node scripts/tokenize-models.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Tokenize model-calculations.json
 * Keeps: id, name, formula, description, type
 * Removes: tabId, groupId, verbose metadata
 */
function tokenizeCalculations(data) {
  const tok = {
    _v: 1,
    _t: new Date().toISOString(),
    _desc: "Tokenized model calculations for LLM reading",
    groups: {},
    calcs: []
  };

  // Compact groups
  if (data.calculationsGroups) {
    data.calculationsGroups.forEach(g => {
      tok.groups[g.id] = g.name;
    });
  }

  // Compact calculations - use short keys
  if (data.calculations) {
    tok.calcs = data.calculations.map(c => {
      const compact = {
        i: c.id,           // id
        n: c.name,         // name
        f: c.formula       // formula
      };
      if (c.description) compact.d = c.description;
      if (c.type) compact.t = c.type;
      if (c.groupId) compact.g = c.groupId;
      return compact;
    });
  }

  // Compact modules
  if (data.modules) {
    tok.mods = data.modules.map(m => ({
      i: m.id,
      t: m.templateId,
      n: m.name,
      in: m.inputs
    }));
  }

  return tok;
}

/**
 * Tokenize model-inputs.json
 * Keeps: key periods, constants, input values
 * Removes: verbose UI state, formulas, empty values
 */
function tokenizeInputs(data) {
  const tok = {
    _v: 1,
    _t: new Date().toISOString(),
    _desc: "Tokenized model inputs for LLM reading",
    config: data.config,
    periods: {},
    constants: {},
    inputs: {}
  };

  // Compact key periods - just id, name, start/end
  if (data.keyPeriods) {
    data.keyPeriods.forEach(p => {
      tok.periods[`F${p.id}`] = {
        n: p.name,
        p: p.periods,
        s: `${p.startYear}-${String(p.startMonth).padStart(2, '0')}`,
        e: `${p.endYear}-${String(p.endMonth).padStart(2, '0')}`
      };
    });
  }

  // Compact inputGlass - constants group (id 100) separately
  if (data.inputGlass) {
    data.inputGlass.forEach(inp => {
      const compact = {
        n: inp.name
      };

      // Add value or values
      if (inp.value !== undefined && inp.value !== null) {
        compact.v = inp.value;
      }
      if (inp.values && Object.keys(inp.values).length > 0) {
        // Compress values - only keep non-zero periods
        const nonZero = {};
        Object.entries(inp.values).forEach(([k, v]) => {
          if (v !== 0 && v !== null && v !== undefined) {
            nonZero[k] = v;
          }
        });
        if (Object.keys(nonZero).length > 0) {
          compact.vs = nonZero;
        }
      }
      if (inp.total !== undefined) {
        compact.tot = inp.total;
      }
      if (inp.unit) {
        compact.u = inp.unit;
      }

      // Group by type
      if (inp.groupId === 100) {
        // Constants - use C1.X notation
        const cNum = inp.id - 99;
        tok.constants[`C1.${cNum}`] = compact;
      } else if (inp.groupId === 1) {
        // CAPEX - use V1.X notation
        tok.inputs[`V1.${inp.id}`] = compact;
      } else if (inp.groupId === 2) {
        // OPEX - use S1.X notation
        tok.inputs[`S1.${inp.id}`] = compact;
      } else {
        // Other inputs
        tok.inputs[`I${inp.id}`] = compact;
      }
    });
  }

  return tok;
}

/**
 * Create human-readable summary for quick reference
 */
function createSummary(calcs, inputs) {
  const lines = [
    "# Model Summary (Auto-generated)",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Key Periods (Flags)",
    "| Flag | Name | Periods | Start | End |",
    "|------|------|---------|-------|-----|"
  ];

  Object.entries(inputs.periods).forEach(([flag, p]) => {
    lines.push(`| ${flag} | ${p.n} | ${p.p} | ${p.s} | ${p.e} |`);
  });

  lines.push("", "## Constants (C1.X)", "| Ref | Name | Value |", "|-----|------|-------|");
  Object.entries(inputs.constants).forEach(([ref, c]) => {
    lines.push(`| ${ref} | ${c.n} | ${c.v} |`);
  });

  lines.push("", "## Calculations (R#)", "| ID | Name | Formula |", "|-----|------|---------|");
  calcs.calcs.slice(0, 50).forEach(c => {
    const formula = c.f.length > 50 ? c.f.substring(0, 47) + "..." : c.f;
    lines.push(`| R${c.i} | ${c.n} | \`${formula}\` |`);
  });
  if (calcs.calcs.length > 50) {
    lines.push(`| ... | (${calcs.calcs.length - 50} more) | ... |`);
  }

  return lines.join("\n");
}

function main() {
  console.log("Tokenizing model files...\n");

  // Read source files
  const calcsPath = path.join(DATA_DIR, 'model-calculations.json');
  const inputsPath = path.join(DATA_DIR, 'model-inputs.json');

  const calcsData = JSON.parse(fs.readFileSync(calcsPath, 'utf8'));
  const inputsData = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));

  // Tokenize
  const calcsToken = tokenizeCalculations(calcsData);
  const inputsToken = tokenizeInputs(inputsData);

  // Write tokenized versions
  const calcsTokenPath = path.join(DATA_DIR, 'model-calculations.tok.json');
  const inputsTokenPath = path.join(DATA_DIR, 'model-inputs.tok.json');
  const summaryPath = path.join(DATA_DIR, 'model-summary.md');

  fs.writeFileSync(calcsTokenPath, JSON.stringify(calcsToken));
  fs.writeFileSync(inputsTokenPath, JSON.stringify(inputsToken));
  fs.writeFileSync(summaryPath, createSummary(calcsToken, inputsToken));

  // Report sizes
  const calcsOrigSize = fs.statSync(calcsPath).size;
  const calcsTokenSize = fs.statSync(calcsTokenPath).size;
  const inputsOrigSize = fs.statSync(inputsPath).size;
  const inputsTokenSize = fs.statSync(inputsTokenPath).size;

  console.log("model-calculations.json:");
  console.log(`  Original: ${(calcsOrigSize / 1024).toFixed(1)} KB`);
  console.log(`  Tokenized: ${(calcsTokenSize / 1024).toFixed(1)} KB (${((1 - calcsTokenSize/calcsOrigSize) * 100).toFixed(0)}% reduction)`);

  console.log("\nmodel-inputs.json:");
  console.log(`  Original: ${(inputsOrigSize / 1024).toFixed(1)} KB`);
  console.log(`  Tokenized: ${(inputsTokenSize / 1024).toFixed(1)} KB (${((1 - inputsTokenSize/inputsOrigSize) * 100).toFixed(0)}% reduction)`);

  console.log(`\nSummary: ${summaryPath}`);
  console.log("\nDone!");
}

main();
