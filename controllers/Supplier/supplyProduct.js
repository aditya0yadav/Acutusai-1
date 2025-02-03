const DEFAULT_PARAMS = {
  callback: "https://www.callback.com/url",
  include_quotas: true,
  payload_max_size_mb: 16,
  payload_max_survey_count: 5000,
  send_interval_seconds: 15,
  opportunities: [
    {
      country_language: { in: ["eng_us", "eng_gb"] },
      study_type: { eq: "adhoc" },
      revenue_per_interview: { gte: 1 },
      bid_incidence: { gte: 50 },
      collects_pii: false,
    },
  ],
};

exports.getSupplyProductCallback = async (req, res) => {
  try {
    const {
      callback = DEFAULT_PARAMS.callback,
      include_quotas = DEFAULT_PARAMS.include_quotas,
      payload_max_size_mb = DEFAULT_PARAMS.payload_max_size_mb,
      payload_max_survey_count = DEFAULT_PARAMS.payload_max_survey_count,
      send_interval_seconds = DEFAULT_PARAMS.send_interval_seconds,
      opportunities,
    } = req.query;

    const formattedOpportunities =
      opportunities && opportunities.length > 0
        ? opportunities.map((op) => ({
            country_language: op.country_language
              ? { in: op.country_language.split(",") }
              : DEFAULT_PARAMS.opportunities[0].country_language,
            study_type: op.study_type
              ? { eq: op.study_type }
              : DEFAULT_PARAMS.opportunities[0].study_type,
            revenue_per_interview: op.revenue_per_interview
              ? { gte: parseFloat(op.revenue_per_interview) }
              : DEFAULT_PARAMS.opportunities[0].revenue_per_interview,
            bid_incidence: op.bid_incidence
              ? { gte: parseFloat(op.bid_incidence) }
              : DEFAULT_PARAMS.opportunities[0].bid_incidence,
            collects_pii:
              op.collects_pii !== undefined
                ? op.collects_pii
                : DEFAULT_PARAMS.opportunities[0].collects_pii,
          }))
        : DEFAULT_PARAMS.opportunities;

    const params = {
      callback,
      include_quotas,
      payload_max_size_mb,
      payload_max_survey_count,
      send_interval_seconds,
      opportunities: formattedOpportunities,
    };

    return res.status(200).json({
      success: true,
      params,
    });
  } catch (error) {
    console.error("Error in getSupplyProductCallback:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};



module.exports = exports.getSupplyProductCallback;
