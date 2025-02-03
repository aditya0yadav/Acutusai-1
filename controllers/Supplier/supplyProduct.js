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

describe('getSupplyProductCallback', () => {
    let mockRequest;
    let mockResponse;
  
    beforeEach(() => {
      // Reset mock request and response objects before each test
      mockRequest = {
        query: {}
      };
      
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    });
  
    test('should return default parameters when no query params provided', async () => {
      await getSupplyProductCallback(mockRequest, mockResponse);
  
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        params: {
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
            }
          ]
        }
      });
    });
  
    test('should handle custom parameters correctly', async () => {
      mockRequest.query = {
        callback: "https://custom-callback.com",
        include_quotas: false,
        payload_max_size_mb: 32,
        payload_max_survey_count: 10000,
        send_interval_seconds: 30,
        opportunities: [{
          country_language: "fra_fr,deu_de",
          study_type: "tracking",
          revenue_per_interview: "2.5",
          bid_incidence: "75",
          collects_pii: true
        }]
      };
  
      await getSupplyProductCallback(mockRequest, mockResponse);
  
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        params: {
          callback: "https://custom-callback.com",
          include_quotas: false,
          payload_max_size_mb: 32,
          payload_max_survey_count: 10000,
          send_interval_seconds: 30,
          opportunities: [{
            country_language: { in: ["fra_fr", "deu_de"] },
            study_type: { eq: "tracking" },
            revenue_per_interview: { gte: 2.5 },
            bid_incidence: { gte: 75 },
            collects_pii: true
          }]
        }
      });
    });
  
    test('should handle empty opportunities array', async () => {
      mockRequest.query = {
        opportunities: []
      };
  
      await getSupplyProductCallback(mockRequest, mockResponse);
  
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json.mock.calls[0][0].params.opportunities).toEqual([
        {
          country_language: { in: ["eng_us", "eng_gb"] },
          study_type: { eq: "adhoc" },
          revenue_per_interview: { gte: 1 },
          bid_incidence: { gte: 50 },
          collects_pii: false,
        }
      ]);
    });
  
    test('should handle error gracefully', async () => {
      // Simulate an error by passing invalid data
      mockRequest.query = {
        payload_max_size_mb: 'invalid'
      };
  
      await getSupplyProductCallback(mockRequest, mockResponse);
  
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error"
      });
    });
  });

module.exports = exports.getSupplyProductCallback;
