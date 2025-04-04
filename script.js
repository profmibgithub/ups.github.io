// Mapping from Grade Pay value to Rationalised Entry Pay (7th CPC Level)
const entryPayMap = {
    '6000': 57700,  // Level 10
    '7000': 68900,  // Level 11
    '8000': 79800,  // Level 12
    '9000': 131400, // Level 13A
    '10000': 144200 // Level 14
};

document.getElementById('pension-form').addEventListener('submit', function(e) {
    e.preventDefault(); // Prevent page reload

    // --- Clear Previous Errors/Results ---
    document.getElementById('error-message').innerText = '';
    document.getElementById('comparison-summary').style.display = 'none'; // Hide comparison
    clearResults();

    // --- Get User Inputs ---
    const dojString = document.getElementById('doj').value;
    const dobString = document.getElementById('dob').value;
    const effectiveDateBasicString = document.getElementById('effectiveDateBasic').value;
    const currentBasic = parseFloat(document.getElementById('currentBasic').value);
    const currentDaRateInput = parseFloat(document.getElementById('currentDaRate').value);
    const gradePay = document.getElementById('gradePay').value; // Get selected grade pay

    // --- Input Validation ---
    if (!dojString || !dobString || !effectiveDateBasicString || isNaN(currentBasic) || isNaN(currentDaRateInput) || !gradePay) {
        document.getElementById('error-message').innerText = 'Please fill in all fields correctly.';
        return;
    }

    const doj = new Date(dojString);
    const dob = new Date(dobString);
    const effectiveDateBasic = new Date(effectiveDateBasicString);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (doj >= today || dob >= today || doj <= dob || effectiveDateBasic > today || effectiveDateBasic < doj) {
         document.getElementById('error-message').innerText = 'Please enter valid Dates (DOB < DOJ <= Effective Date <= Today).';
         return;
    }
     if (currentBasic <= 0 || currentDaRateInput < 0) {
         document.getElementById('error-message').innerText = 'Basic Pay must be positive, DA Rate cannot be negative.';
        return;
    }

    // --- Grade Pay Validation (Basic Check) ---
    const expectedEntryPay = entryPayMap[gradePay];
    // If the effective date is the same year as DOJ, the basic shouldn't be MUCH lower than entry pay.
    if (effectiveDateBasic.getFullYear() === doj.getFullYear() && currentBasic < expectedEntryPay * 0.95) { // Allow slight variation
         console.warn(`Warning: Current Basic Pay (${formatCurrency(currentBasic)}) seems low for the selected Grade Pay ${gradePay} (Entry Pay: ${formatCurrency(expectedEntryPay)}) near the date of joining. Calculation will proceed, but please verify inputs.`);
         // Optional: Display warning to user:
         // document.getElementById('error-message').innerText = `Warning: Current Basic seems low for GP ${gradePay} near DOJ. Verify inputs.`;
    }
     if (currentBasic < 20000 && expectedEntryPay > 50000) { // Generic sanity check
         console.warn(`Warning: Current Basic Pay (${formatCurrency(currentBasic)}) seems very low for the selected Grade Pay ${gradePay}. Calculation will proceed, but please verify inputs.`);
     }


    // --- Constants & Assumptions ---
    const RETIREMENT_AGE = 60;
    const ANNUAL_INCREMENT_RATE = 0.03; // 3%
    const AVG_DA_INCREASE_PERCENT = 3.5; // 3.5% increase per hike
    const PAY_REVISION_INTERVAL = 10; // Years
    const PAY_REVISION_INCREASE_RATE = 0.20; // 20% assumption
    const PAY_REVISION_YEARS = [2016, 2026, 2036, 2046, 2056]; // Known/Expected revision years
    const NPS_ASSUMED_ROR = 0.09; // 9% p.a.
    const NPS_ANNUITY_RATE = 0.065; // 6.5% p.a.
    const POST_RETIREMENT_DR_GROWTH_RATE = 0.03; // Avg 3% annual growth post-retirement
    const GRATUITY_CEILING = 2000000; // 20 Lakhs (Current)

    // --- Basic Calculations ---
    const retirementDate = new Date(dob);
    retirementDate.setFullYear(dob.getFullYear() + RETIREMENT_AGE);
    retirementDate.setMonth(retirementDate.getMonth() + 1, 0); // Last day of the month turning 60

    const serviceMonthsTotal = calculateMonthsDifference(doj, retirementDate);
    const qualifyingServiceYears = Math.floor(serviceMonthsTotal / 12);
    const qualifyingServiceMonths = serviceMonthsTotal % 12;

    document.getElementById('retirement-date').innerText = retirementDate.toLocaleDateString('en-IN');
    document.getElementById('qualifying-service').innerText = `${qualifyingServiceYears} years, ${qualifyingServiceMonths} months (${serviceMonthsTotal} months)`;

    // --- Core Projection ---
    const projectionResult = projectPayAndBenefits(
        doj, retirementDate,
        effectiveDateBasic, // Pass the effective date
        currentBasic, currentDaRateInput, // Pass current DA rate
        ANNUAL_INCREMENT_RATE, AVG_DA_INCREASE_PERCENT,
        PAY_REVISION_INTERVAL, PAY_REVISION_INCREASE_RATE, PAY_REVISION_YEARS,
        NPS_ASSUMED_ROR,
        gradePay // Pass gradePay for context/future use
    );

    const estLastBasicPay = projectionResult.lastBasicPay;
    const estLastDaRate = projectionResult.lastDaRate; // DA Rate at retirement
    const estNpsCorpus = projectionResult.npsCorpus;

    const estLastEmoluments = estLastBasicPay * (1 + estLastDaRate / 100);

    document.getElementById('last-basic').innerText = formatCurrency(estLastBasicPay);
    document.getElementById('last-emoluments').innerText = formatCurrency(estLastEmoluments);

    // --- NPS Calculation ---
    const npsLumpSum = estNpsCorpus * 0.60;
    const npsAnnuityCorpus = estNpsCorpus * 0.40;
    const npsMonthlyPension = (npsAnnuityCorpus * NPS_ANNUITY_RATE) / 12;
    const npsPayout20yrs = npsMonthlyPension * 240; // Pension is fixed
    const npsTotal20yrs = npsLumpSum + npsPayout20yrs;

    document.getElementById('nps-corpus').innerText = formatCurrency(estNpsCorpus);
    document.getElementById('nps-lumpsum').innerText = formatCurrency(npsLumpSum);
    document.getElementById('nps-annuity-corpus').innerText = formatCurrency(npsAnnuityCorpus);
    document.getElementById('nps-pension').innerText = `${formatCurrency(npsMonthlyPension)} / month`;
    document.getElementById('nps-payout-20yrs').innerText = formatCurrency(npsPayout20yrs);
    document.getElementById('nps-total-20yrs').innerText = formatCurrency(npsTotal20yrs);


    // --- UPS Calculation ---
    let upsAssuredMonthlyPension;
    if (serviceMonthsTotal >= 120) { // Minimum 10 years QS needed for UPS
         upsAssuredMonthlyPension = (estLastBasicPay / 2) * (Math.min(serviceMonthsTotal, 300) / 300); // Proportionate if < 25 yrs (300 months)
         upsAssuredMonthlyPension = Math.max(upsAssuredMonthlyPension, 10000); // Apply minimum guarantee after proportionality
    } else {
        upsAssuredMonthlyPension = 0; // Not eligible for UPS pension
    }

    const serviceBlocksL = Math.floor(serviceMonthsTotal / 6); // For Reg 14 lumpsum
    const upsGuaranteedLumpsum = (serviceMonthsTotal >= 120) ? (estLastEmoluments / 10) * serviceBlocksL : 0; // Only if eligible

    const upsOptionalMaxLumpsum = (serviceMonthsTotal >= 120) ? estNpsCorpus * 0.60 : 0; // Using NPS corpus as proxy for IC/BC, only if eligible

    const opsGratuity = Math.min(GRATUITY_CEILING, (estLastEmoluments / 4) * qualifyingServiceYears);

    const upsPension20YearTotal = (serviceMonthsTotal >= 120) ? calculateGrowingPayout(upsAssuredMonthlyPension, estLastDaRate / 100, POST_RETIREMENT_DR_GROWTH_RATE, 20) : 0;

    const upsTotal20yrs = upsGuaranteedLumpsum + opsGratuity + upsPension20YearTotal;

    document.getElementById('ups-pension').innerText = (upsAssuredMonthlyPension > 0) ? `${formatCurrency(upsAssuredMonthlyPension)} / month` : 'Not Eligible (<10 Yrs Service)';
    document.getElementById('ups-gratuity').innerText = formatCurrency(opsGratuity);
    document.getElementById('ups-guaranteed-lumpsum').innerText = formatCurrency(upsGuaranteedLumpsum);
    document.getElementById('ups-optional-lumpsum').innerText = formatCurrency(upsOptionalMaxLumpsum);
    document.getElementById('ups-payout-20yrs').innerText = formatCurrency(upsPension20YearTotal);
    document.getElementById('ups-total-20yrs').innerText = formatCurrency(upsTotal20yrs);

    // --- Show Comparison ---
    document.getElementById('compare-nps-total').innerText = formatCurrency(npsTotal20yrs);
    document.getElementById('compare-ups-total').innerText = formatCurrency(upsTotal20yrs);
    let comparisonText = "N/A";
    if (upsTotal20yrs > 0 || npsTotal20yrs > 0) { // Only compare if there are values
        comparisonText = "NPS provides a higher total payout in the first 20 years primarily due to the larger initial lumpsum.";
        if (upsTotal20yrs > npsTotal20yrs) {
            comparisonText = "UPS provides a higher total payout in the first 20 years.";
        } else if (upsTotal20yrs === npsTotal20yrs) {
            comparisonText = "NPS and UPS provide similar total payouts in the first 20 years (check assumptions).";
        }
    }
    document.getElementById('compare-result').innerText = comparisonText;
    document.getElementById('comparison-summary').style.display = 'block';

});

// --- Helper Functions --- (formatCurrency, clearResults, calculateMonthsDifference, calculateGrowingPayout remain the same)
function formatCurrency(value) {
    if (isNaN(value) || value === null || value === undefined) return '-';
    return `₹ ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function clearResults() {
     const resultSpans = document.querySelectorAll('.result-value');
     resultSpans.forEach(span => span.innerText = '-');
     document.getElementById('error-message').innerText = '';
     document.getElementById('retirement-date').innerText = '-';
     document.getElementById('qualifying-service').innerText = '-';
     document.getElementById('last-basic').innerText = '-';
     document.getElementById('last-emoluments').innerText = '-';
     document.getElementById('comparison-summary').style.display = 'none'; // Hide comparison too
}

function calculateMonthsDifference(startDate, endDate) {
  // Calculate the difference in years and months
  let yearsDifference = endDate.getFullYear() - startDate.getFullYear();
  let monthsDifference = endDate.getMonth() - startDate.getMonth();

  // Adjust for the day of the month
  // If the end day is less than the start day, we haven't completed the last month.
  if (endDate.getDate() < startDate.getDate()) {
    monthsDifference--;
  }

  // Calculate total months
  let totalMonths = yearsDifference * 12 + monthsDifference;

  // Ensure non-negative result, although logic should prevent this with valid dates
  return Math.max(0, totalMonths);
}


function calculateGrowingPayout(initialMonthlyPension, initialDrFraction, annualDrGrowthRate, years) {
    if (initialMonthlyPension <= 0) return 0; // No payout if not eligible

    let totalPayout = 0;
    let currentDrRate = initialDrFraction; // Start with DR at retirement

    for (let year = 1; year <= years; year++) {
        // Calculate total pension for the year (Basic Pension + DR amount)
        let drAmountForTheYear = initialMonthlyPension * currentDrRate;
        let totalPensionForTheYear = (initialMonthlyPension + drAmountForTheYear) * 12;
        totalPayout += totalPensionForTheYear;

        // Estimate DR rate for the start of the *next* year
        // Simple additive increase for approximation - actual DR is complex
        let yearlyIncreasePoints = (1 + currentDrRate) * annualDrGrowthRate; // Rough estimate of points increase
        currentDrRate += yearlyIncreasePoints;

         // Alternative simpler DR growth: currentDrRate *= (1 + annualDrGrowthRate); // Compound the rate itself (less accurate for govt DR)
    }
    return totalPayout;
}


// --- !! Core Projection Logic (Updated) !! ---
function projectPayAndBenefits(
    doj, retirementDate,
    effectiveDateBasic, // Date the currentBasic is effective from
    currentBasic, currentDaRatePercent, // Use the input DA rate percentage
    incrementRate, avgDaIncreasePercent, // DA increase is now in Percent Points
    revisionInterval, revisionIncrease, revisionYears,
    npsROR,
    gradePay // Passed for context
) {
    let basicPay = currentBasic;
    let daRate = currentDaRatePercent / 100.0; // Convert to fraction for calculation
    let npsCorpus = 0;

    let currentDate = new Date(effectiveDateBasic); // Start simulation from effective date
    currentDate.setDate(1); // Normalize to start of the month
    const simEndDate = new Date(retirementDate);

    console.log(`Starting Projection: DOJ=${doj.toLocaleDateString()}, Retire=${simEndDate.toLocaleDateString()}, Eff.Date=${effectiveDateBasic.toLocaleDateString()}, Start Basic=${basicPay}, Start DA%=${currentDaRatePercent}, GP=${gradePay}`);


    while (currentDate <= simEndDate) {
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth(); // 0-11

        // 1. Check for Pay Revision (Effective Jan 1st of the revision year)
        // Revision applies *before* other calculations for that year start
        if (revisionYears.includes(currentYear) && currentMonth === 0 && currentYear > effectiveDateBasic.getFullYear()) { // Don't apply revision in the initial year if eff date is later
             console.log(`Applying Pay Revision in Jan ${currentYear}`);
             basicPay *= (1 + revisionIncrease);
             daRate = 0; // IMPORTANT: DA resets to 0 after revision
             console.log(` -> New Basic: ${basicPay.toFixed(0)}, DA Rate Reset to 0%`);
        }

        // 2. Check for DA Hike (Jan and July - Calculate amount based on *current* basic)
        if (currentMonth === 0 || currentMonth === 6) { // January or July
            // DA increase is typically % points on the Basic Pay.
            let daIncreasePoints = avgDaIncreasePercent / 100.0; // Convert percentage points to fraction
            daRate += daIncreasePoints;
            console.log(`DA Hike effective ${currentYear}-${currentMonth + 1}. Rate: ${(daRate * 100).toFixed(2)}%`);
        }

         // 3. Calculate Monthly Contributions (NPS)
         // Check if we are past the Date of Joining
         if (currentDate >= doj) {
            let monthlyEmoluments = basicPay * (1 + daRate);
            let employeeNpsContribution = monthlyEmoluments * 0.10;
            let employerNpsContribution = monthlyEmoluments * 0.14; // NPS rule
            let totalMonthlyNpsContribution = employeeNpsContribution + employerNpsContribution;

            // Add contribution *before* compounding for the month
            npsCorpus += totalMonthlyNpsContribution;
         }

         // 4. Compound NPS Corpus Monthly
         // Only compound if service has started
          if (currentDate >= doj) {
             npsCorpus *= (1 + npsROR / 12); // Apply monthly growth
          }

         // 5. Apply Annual Increment (Effective July 1st)
         // Check *after* contributions for June (month 5)
         if (currentMonth === 6) { // Apply increment for July
             basicPay *= (1 + incrementRate);
            console.log(`Increment applied effective July ${currentYear}. New Basic: ${basicPay.toFixed(0)}`);
         }

        // Move simulation to the next month
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    console.log(`Projection End: Last Basic=${basicPay.toFixed(0)}, Last DA Rate=${(daRate * 100).toFixed(2)}%, Est. Corpus=${npsCorpus.toFixed(0)}`);

    // Return the final calculated values just before retirement
    return {
        lastBasicPay: basicPay,
        lastDaRate: daRate * 100, // Return as percentage
        npsCorpus: npsCorpus,
    };
}