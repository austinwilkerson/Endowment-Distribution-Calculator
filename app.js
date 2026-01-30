const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const form = document.getElementById("inputs-form");
const smoothingToggle = document.getElementById("smoothing-toggle");
const smoothingWrapper = document.getElementById("smoothing-window-wrapper");
const exportButton = document.getElementById("export-csv");

const summaryFields = {
  totalContributions: document.getElementById("total-contributions"),
  investmentGrowth: document.getElementById("investment-growth"),
  totalDistributions: document.getElementById("total-distributions"),
  totalAdminFees: document.getElementById("total-admin-fees"),
  finalValue: document.getElementById("final-value"),
};

const feeImpactFields = {
  finalWithFees: document.getElementById("final-with-fees"),
  finalWithoutFees: document.getElementById("final-without-fees"),
  feeDifference: document.getElementById("fee-difference"),
  feesPaid: document.getElementById("fees-paid"),
};

const breakdownBody = document.getElementById("breakdown-body");

let endowmentChart;
let distributionChart;
let feeImpactChart;

const getInputValue = (id) => Number.parseFloat(document.getElementById(id).value) || 0;
const getInputInt = (id) => Math.max(1, Number.parseInt(document.getElementById(id).value, 10) || 1);

const toQuarterRate = (annualRate) => Math.pow(1 + annualRate, 0.25) - 1;

const computeProjection = ({
  initialGift,
  annualContribution,
  annualReturn,
  spendingRate,
  adminFee,
  years,
  smoothingEnabled,
  smoothingWindow,
}) => {
  const quarters = years * 4;
  const rq = toQuarterRate(annualReturn);
  const sq = toQuarterRate(spendingRate);
  const fq = toQuarterRate(adminFee);
  const contributionPerQuarter = annualContribution / 4;

  const quarterData = [];
  const yearData = Array.from({ length: years }, (_, index) => ({
    year: index + 1,
    startingBalance: 0,
    totalContributions: 0,
    totalDistributions: 0,
    totalAdminFees: 0,
    investmentGrowth: 0,
    endingBalance: 0,
  }));

  let balance = Math.max(0, initialGift);
  const marketValues = [];

  for (let i = 0; i < quarters; i += 1) {
    const yearIndex = Math.floor(i / 4);
    const quarter = (i % 4) + 1;
    const year = yearIndex + 1;

    if (quarter === 1) {
      yearData[yearIndex].startingBalance = balance;
    }

    const beginBalance = balance;

    // Ordering per quarter:
    // 1) Begin balance
    // 2) Add contribution
    // 3) Determine spending base (with optional smoothing)
    // 4) Apply distribution + admin fee
    // 5) Apply investment return
    balance += contributionPerQuarter;

    let spendingBase = balance;
    if (smoothingEnabled) {
      const windowSize = Math.min(smoothingWindow, marketValues.length);
      if (windowSize > 0) {
        const recentValues = marketValues.slice(-windowSize);
        const sum = recentValues.reduce((acc, value) => acc + value, 0);
        spendingBase = sum / windowSize;
      }
    }

    const distribution = spendingBase * sq;
    const adminFeeAmount = spendingBase * fq;

    balance = Math.max(0, balance - distribution - adminFeeAmount);

    const investmentReturnAmount = balance * rq;
    balance += investmentReturnAmount;

    marketValues.push(balance);

    quarterData.push({
      quarterIndex: i + 1,
      year,
      quarter,
      beginBalance,
      contribution: contributionPerQuarter,
      spendingBase,
      distribution,
      adminFee: adminFeeAmount,
      investmentReturnAmount,
      endBalance: balance,
    });

    const currentYear = yearData[yearIndex];
    currentYear.totalContributions += contributionPerQuarter;
    currentYear.totalDistributions += distribution;
    currentYear.totalAdminFees += adminFeeAmount;
    currentYear.investmentGrowth += investmentReturnAmount;
    if (quarter === 4) {
      currentYear.endingBalance = balance;
    }
  }

  const totals = quarterData.reduce(
    (acc, item) => {
      acc.contributions += item.contribution;
      acc.distributions += item.distribution;
      acc.adminFees += item.adminFee;
      acc.investmentGrowth += item.investmentReturnAmount;
      return acc;
    },
    {
      contributions: 0,
      distributions: 0,
      adminFees: 0,
      investmentGrowth: 0,
    }
  );

  return {
    quarterData,
    yearData,
    totals: {
      totalContributions: totals.contributions + initialGift,
      totalDistributions: totals.distributions,
      totalAdminFees: totals.adminFees,
      investmentGrowth: totals.investmentGrowth,
      finalValue: balance,
    },
  };
};

const renderSummary = (totals) => {
  summaryFields.totalContributions.textContent = currencyFormatter.format(totals.totalContributions);
  summaryFields.investmentGrowth.textContent = currencyFormatter.format(totals.investmentGrowth);
  summaryFields.totalDistributions.textContent = currencyFormatter.format(totals.totalDistributions);
  summaryFields.totalAdminFees.textContent = currencyFormatter.format(totals.totalAdminFees);
  summaryFields.finalValue.textContent = currencyFormatter.format(totals.finalValue);
};

const renderFeeImpact = (withFees, withoutFees) => {
  feeImpactFields.finalWithFees.textContent = currencyFormatter.format(withFees.finalValue);
  feeImpactFields.finalWithoutFees.textContent = currencyFormatter.format(withoutFees.finalValue);
  feeImpactFields.feeDifference.textContent = currencyFormatter.format(withoutFees.finalValue - withFees.finalValue);
  feeImpactFields.feesPaid.textContent = currencyFormatter.format(withFees.totalAdminFees);
};

const renderTable = (yearData) => {
  breakdownBody.innerHTML = "";
  yearData.forEach((year) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${year.year}</td>
      <td>${currencyFormatter.format(year.startingBalance)}</td>
      <td>${currencyFormatter.format(year.totalContributions)}</td>
      <td>${currencyFormatter.format(year.totalDistributions)}</td>
      <td>${currencyFormatter.format(year.totalAdminFees)}</td>
      <td>${currencyFormatter.format(year.investmentGrowth)}</td>
      <td>${currencyFormatter.format(year.endingBalance)}</td>
    `;
    breakdownBody.appendChild(row);
  });
};

const createChart = (canvasId, label, labels, data, color) => {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: color,
          tension: 0.2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => currencyFormatter.format(value),
          },
        },
      },
    },
  });
};

const renderCharts = (yearData, feeImpactData) => {
  const labels = yearData.map((item) => `Year ${item.year}`);
  const endowmentValues = yearData.map((item) => item.endingBalance);
  const distributions = yearData.map((item) => item.totalDistributions);

  if (endowmentChart) {
    endowmentChart.destroy();
  }
  if (distributionChart) {
    distributionChart.destroy();
  }

  endowmentChart = createChart(
    "endowment-chart",
    "Endowment Value",
    labels,
    endowmentValues,
    "#1f6feb"
  );

  distributionChart = createChart(
    "distribution-chart",
    "Annual Distributions",
    labels,
    distributions,
    "#f97316"
  );

  if (feeImpactChart) {
    feeImpactChart.destroy();
  }

  feeImpactChart = new Chart(document.getElementById("fee-impact-chart"), {
    type: "line",
    data: {
      labels: feeImpactData.labels,
      datasets: [
        {
          label: "With Fees",
          data: feeImpactData.withFees,
          borderColor: "#475569",
          backgroundColor: "#475569",
          tension: 0.2,
          fill: false,
        },
        {
          label: "Without Fees",
          data: feeImpactData.withoutFees,
          borderColor: "#16a34a",
          backgroundColor: "#16a34a",
          tension: 0.2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => currencyFormatter.format(value),
          },
        },
      },
    },
  });
};

const exportCSV = (yearData) => {
  const headers = [
    "Year",
    "Starting Balance",
    "Total Contributions",
    "Total Distributions",
    "Total Admin Fees",
    "Investment Growth",
    "Ending Balance",
  ];

  const rows = yearData.map((year) => [
    year.year,
    Math.round(year.startingBalance),
    Math.round(year.totalContributions),
    Math.round(year.totalDistributions),
    Math.round(year.totalAdminFees),
    Math.round(year.investmentGrowth),
    Math.round(year.endingBalance),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "endowment-projection.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const validateInputs = ({ years, smoothingEnabled, smoothingWindow }) => {
  if (years < 1) {
    return false;
  }
  if (smoothingEnabled && smoothingWindow < 1) {
    return false;
  }
  return true;
};

const runProjection = () => {
  const inputs = {
    initialGift: Math.max(0, getInputValue("initial-gift")),
    annualContribution: Math.max(0, getInputValue("annual-contribution")),
    annualReturn: Math.max(0, getInputValue("annual-return")) / 100,
    spendingRate: Math.max(0, getInputValue("spending-rate")) / 100,
    adminFee: Math.max(0, getInputValue("admin-fee")) / 100,
    years: getInputInt("years"),
    smoothingEnabled: smoothingToggle.checked,
    smoothingWindow: getInputInt("smoothing-window"),
  };

  if (!validateInputs(inputs)) {
    return;
  }

  const { yearData, totals } = computeProjection(inputs);
  const feeFreeProjection = computeProjection({
    ...inputs,
    adminFee: 0,
  });

  const feeImpactData = {
    labels: yearData.map((item) => `Year ${item.year}`),
    withFees: yearData.map((item) => item.endingBalance),
    withoutFees: feeFreeProjection.yearData.map((item) => item.endingBalance),
  };

  renderSummary(totals);
  renderFeeImpact(totals, feeFreeProjection.totals);
  renderTable(yearData);
  renderCharts(yearData, feeImpactData);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runProjection();
});

smoothingToggle.addEventListener("change", () => {
  smoothingWrapper.classList.toggle("hidden", !smoothingToggle.checked);
});

exportButton.addEventListener("click", () => {
  const inputs = {
    initialGift: Math.max(0, getInputValue("initial-gift")),
    annualContribution: Math.max(0, getInputValue("annual-contribution")),
    annualReturn: Math.max(0, getInputValue("annual-return")) / 100,
    spendingRate: Math.max(0, getInputValue("spending-rate")) / 100,
    adminFee: Math.max(0, getInputValue("admin-fee")) / 100,
    years: getInputInt("years"),
    smoothingEnabled: smoothingToggle.checked,
    smoothingWindow: getInputInt("smoothing-window"),
  };

  if (!validateInputs(inputs)) {
    return;
  }

  const { yearData } = computeProjection(inputs);
  exportCSV(yearData);
});

const debounce = (fn, delay = 300) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const debouncedRun = debounce(runProjection, 250);

form.addEventListener("input", (event) => {
  if (event.target?.matches("input")) {
    debouncedRun();
  }
});

form.addEventListener("change", (event) => {
  if (event.target?.matches("input")) {
    debouncedRun();
  }
});

runProjection();
