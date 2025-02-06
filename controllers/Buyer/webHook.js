const axios = require('axios');
const { Sequelize } = require('sequelize');
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require('../../models/uniqueSurvey');

const LUCID_API_CONFIG = {
    baseUrl: 'https://api.samplicio.us/Supply/v1/SupplierLinks',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'A8B96D8F-AB75-4C8C-B692-BE7AC2665BA7',
        'Accept': 'text/plain'
    }
};

const RETRY_OPTIONS = {
    maxRetries: 3,
    backoffMs: 1000
};

async function retryOperation(operation, options = RETRY_OPTIONS) {
    let lastError;
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (error.parent?.code === 'ER_LOCK_DEADLOCK') {
                const delay = options.backoffMs * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

async function fetchLinksFromLucid(surveyId) {
    const postUrl = `${LUCID_API_CONFIG.baseUrl}/Create/${surveyId}/6588`;
    const params = {
        SupplierLinkTypeCode: 'OWS',
        TrackingTypeCode: 'NONE'
    };

    try {
        const { data, status } = await axios.post(postUrl, params, { headers: LUCID_API_CONFIG.headers });
        if (status === 200 && data.SupplierLink) {
            const { LiveLink, TestLink, DefaultLink } = data.SupplierLink;
            return {
                livelink: DefaultLink === null ? LiveLink : null,
                testlink: TestLink || null
            };
        }
        return { livelink: null, testlink: null };
    } catch (error) {
        return { livelink: null, testlink: null };
    }
}

async function updateQuotasAndQualifications(surveyId, quotas, qualifications) {
    if (quotas) {
        await retryOperation(async () => {
            await ResearchSurveyQuota.destroy({ where: { survey_id: surveyId } });
            await Promise.all(quotas.map(quota => ResearchSurveyQuota.create({ ...quota, survey_id: surveyId })));
        });
    }

    if (qualifications) {
        await retryOperation(async () => {
            await ResearchSurveyQualification.destroy({ where: { survey_id: surveyId } });
            await Promise.all(qualifications.map(qualification => ResearchSurveyQualification.create({ ...qualification, survey_id: surveyId })));
        });
    }
}

async function updateExistingSurvey(existingSurvey, surveyData) {
    try {
        const { survey_quotas, survey_qualifications, ...surveyDetails } = surveyData;
        const updatedSurvey = await retryOperation(async () => {
            return await existingSurvey.update(surveyDetails);
        });
        await updateQuotasAndQualifications(surveyData.survey_id, survey_quotas, survey_qualifications);
        return updatedSurvey;
    } catch (error) {
        throw error;
    }
}

async function createNewSurvey(surveyData, links) {
    try {
        const { survey_quotas, survey_qualifications, ...surveyDetails } = surveyData;
        const newSurvey = await retryOperation(async () => {
            return await ResearchSurvey.create({
                ...surveyDetails,
                livelink: links.livelink,
                testlink: links.testlink
            });
        });
        await updateQuotasAndQualifications(newSurvey.survey_id, survey_quotas, survey_qualifications);
        return newSurvey;
    } catch (error) {
        throw error;
    }
}

async function processSurvey(surveyData) {
    const { survey_id, message_reason } = surveyData;
    try {
        let existingSurvey = await ResearchSurvey.findOne({ where: { survey_id } });

        if (existingSurvey) {
            if (['reactivated', 'deactivated'].includes(message_reason)) {
                return await retryOperation(() => existingSurvey.update({ message_reason }));
            }
            if (message_reason === 'updated') {
                return await updateExistingSurvey(existingSurvey, surveyData);
            }
        }

        if (!existingSurvey && message_reason === 'new') {
            const links = await fetchLinksFromLucid(survey_id);
            if (!links?.livelink || links.livelink === 'Not') {
                return null;
            }
            return await createNewSurvey(surveyData, links);
        }
        return null;
    } catch (error) {
        throw error;
    }
}

async function createSurvey(req, res) {
    try {
        const surveys = req.body;
        const results = await Promise.all(surveys.map(processSurvey));
        console.log(results) ;
        res.status(201).json({
            message: 'Surveys processed successfully',
            surveys: results.filter(Boolean)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error processing surveys', error: error.message });
    }
}

module.exports = { createSurvey };
