const affiliateLinks = {
    creator: 'https://t.me/agenonymous_bot?start=creator_12345',
    user: 'https://t.me/agenonymous_bot?start=user_affiliate_67890'
};

// Parse start parameters
function parseStartParam(startParam) {
    const [type, id] = startParam.split('_');
    return { type, affiliateId: id };
}
