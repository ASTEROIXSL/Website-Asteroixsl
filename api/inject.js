const axios = require('axios');
const crypto = require('crypto');

// ============ PROXY POOL ============
const PROXIES = [
    'http://104.28.205.12:8080',
    'http://45.76.145.98:3128',
    'http://103.152.232.50:8080'
];

function getRandomProxy() {
    return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

function generateDeviceId() {
    return crypto.randomBytes(8).toString('hex');
}

function generateXGorgon(url) {
    // Simulasi X-Gorgon — lu perlu reverse-engineer buat production
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = crypto.createHash('md5').update(url + timestamp).digest('hex');
    return `8404${hash.substring(0, 16)}`;
}

// ============ USERNAME -> USER ID RESOLVER ============
async function resolveUsername(username) {
    const cleanUsername = username.replace('@', '').trim();
    
    try {
        const url = `https://www.tiktok.com/@${cleanUsername}?lang=en`;
        
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G990B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });

        const html = res.data;

        // Ekstrak JSON embedded dari HTML TikTok
        const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);
        
        if (!jsonMatch) throw new Error('Gak bisa parse data TikTok');

        const jsonData = JSON.parse(jsonMatch[1]);
        const userData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        
        if (!userData) throw new Error('User gak ditemukan');

        const user = userData.user;
        const stats = userData.stats;

        return {
            success: true,
            userId: user.id,
            uniqueId: user.uniqueId,
            nickname: user.nickname,
            avatarLarger: user.avatarLarger || user.avatarMedium,
            avatarMedium: user.avatarMedium,
            verified: user.verified,
            privateAccount: user.privateAccount,
            followerCount: stats.followerCount,
            followingCount: stats.followingCount,
            heartCount: stats.heartCount,
            videoCount: stats.videoCount,
            signature: user.signature || ''
        };

    } catch (e) {
        // Fallback: pake API unofficial
        try {
            const fallbackRes = await axios.get(
                `https://www.tiktok.com/api/user/detail/?uniqueId=${cleanUsername}`,
                {
                    headers: {
                        'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 13; en_US; SM-G990B; Build/TP1A.220624.014; tt-ok/3.12.13.4)',
                        'Cookie': `sessionid=${crypto.randomBytes(16).toString('hex')}`
                    },
                    timeout: 8000
                }
            );

            const data = fallbackRes.data;
            if (data?.userInfo?.user) {
                const u = data.userInfo.user;
                const s = data.userInfo.stats;
                return {
                    success: true,
                    userId: u.id,
                    uniqueId: u.uniqueId,
                    nickname: u.nickname,
                    avatarLarger: u.avatarLarger || u.avatarMedium,
                    avatarMedium: u.avatarMedium,
                    verified: u.verified || false,
                    privateAccount: u.privateAccount || false,
                    followerCount: s?.followerCount || 0,
                    followingCount: s?.followingCount || 0,
                    heartCount: s?.heartCount || 0,
                    videoCount: s?.videoCount || 0,
                    signature: u.signature || ''
                };
            }
            throw new Error('User not found in fallback');
        } catch (fallbackError) {
            return {
                success: false,
                error: `Gagal resolve @${cleanUsername}: ${fallbackError.message}`
            };
        }
    }
}

// ============ RESOLVE VIDEO ID ============
async function resolveVideoId(videoUrl) {
    try {
        const cleanUrl = videoUrl.trim();
        
        // Cek kalo udah ID langsung
        if (/^\d{17,19}$/.test(cleanUrl)) {
            return { success: true, videoId: cleanUrl };
        }
        
        const res = await axios.get(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G990B) AppleWebKit/537.36',
            },
            maxRedirects: 5,
            timeout: 10000
        });

        const finalUrl = res.request?.res?.responseUrl || res.request?.href || cleanUrl;
        const match = finalUrl.match(/video\/(\d+)/);
        
        if (match) {
            return { success: true, videoId: match[1] };
        }
        
        return { success: false, error: 'Gak bisa ekstrak video ID' };
    } catch (e) {
        return { success: false, error: `Gagal resolve video: ${e.message}` };
    }
}

// ============ INJECTION FUNCTIONS ============
async function injectFollowers(userId, amount) {
    let success = 0;
    const batchSize = Math.min(amount, 50);
    
    for (let i = 0; i < batchSize; i++) {
        try {
            const payload = new URLSearchParams({
                user_id: userId,
                sec_user_id: '',
                type: '1',
                channel_id: '3',
                device_id: generateDeviceId(),
                device_platform: 'android',
                app_name: 'musical_ly',
                version_code: '34.5.0',
                device_type: 'SM-G990B',
                os_version: '13',
                language: 'en'
            }).toString();

            const res = await axios.post(
                'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/commit/follow/user',
                payload,
                {
                    headers: {
                        'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 13; en_US; SM-G990B; Build/TP1A.220624.014; tt-ok/3.12.13.4)',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Gorgon': generateXGorgon('/aweme/v1/commit/follow/user'),
                        'X-Khronos': Math.floor(Date.now() / 1000).toString(),
                        'Cookie': `sessionid=${crypto.randomBytes(16).toString('hex')}; odin_tt=${crypto.randomBytes(12).toString('hex')}`
                    },
                    timeout: 8000
                }
            );
            
            if (res.data?.status_code === 0) success++;
        } catch (e) {}
        
        // Delay realistis
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 300) + 150));
    }
    return success;
}

async function injectViews(videoId, amount) {
    let success = 0;
    const batchSize = Math.min(amount, 100);
    
    for (let i = 0; i < batchSize; i++) {
        try {
            await axios.get(
                `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/aweme/stats/?aweme_id=${videoId}&device_id=${generateDeviceId()}`,
                {
                    headers: {
                        'User-Agent': `Dalvik/2.1.0 (Linux; U; Android 12; SM-A${Math.floor(Math.random()*900)+100} Build)`,
                        'X-Gorgon': generateXGorgon(`/aweme/v1/aweme/stats/?aweme_id=${videoId}`),
                        'X-Khronos': Math.floor(Date.now() / 1000).toString()
                    },
                    timeout: 5000
                }
            );
            success++;
        } catch (e) {}
        
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 100) + 50));
    }
    return success;
}

async function injectLikes(videoId, amount) {
    let success = 0;
    const batchSize = Math.min(amount, 50);
    
    for (let i = 0; i < batchSize; i++) {
        try {
            const payload = new URLSearchParams({
                aweme_id: videoId,
                type: '1',
                channel_id: '3',
                device_id: generateDeviceId(),
                device_platform: 'android',
                version_code: '34.5.0'
            }).toString();

            const res = await axios.post(
                'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/commit/item/digg',
                payload,
                {
                    headers: {
                        'User-Agent': 'com.zhiliaoapp.musically/2022600030',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Gorgon': generateXGorgon('/aweme/v1/commit/item/digg'),
                        'X-Khronos': Math.floor(Date.now() / 1000).toString(),
                        'Cookie': `sessionid=${crypto.randomBytes(16).toString('hex')}`
                    },
                    timeout: 8000
                }
            );
            
            if (res.data?.status_code === 0) success++;
        } catch (e) {}
        
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 300) + 150));
    }
    return success;
}

// ============ MAIN API HANDLER ============
module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.body;

    // ======== RESOLVE USERNAME ========
    if (action === 'resolve') {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, error: 'Username diperlukan' });
        }

        const userData = await resolveUsername(username);
        
        if (userData.success) {
            return res.json({
                success: true,
                data: {
                    userId: userData.userId,
                    uniqueId: userData.uniqueId,
                    nickname: userData.nickname,
                    avatarUrl: userData.avatarLarger,
                    verified: userData.verified,
                    privateAccount: userData.privateAccount,
                    stats: {
                        followers: userData.followerCount,
                        following: userData.followingCount,
                        likes: userData.heartCount,
                        videos: userData.videoCount
                    },
                    signature: userData.signature
                }
            });
        } else {
            return res.json({ success: false, error: userData.error });
        }
    }

    // ======== RESOLVE VIDEO ========
    if (action === 'resolveVideo') {
        const { videoUrl } = req.body;
        
        if (!videoUrl) {
            return res.status(400).json({ success: false, error: 'URL video diperlukan' });
        }

        const videoData = await resolveVideoId(videoUrl);
        return res.json(videoData);
    }

    // ======== INJECT ========
    if (action === 'inject') {
        const { type, targetId, amount } = req.body;

        if (!type || !targetId || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Parameter tidak lengkap: type, targetId, amount wajib' 
            });
        }

        if (amount > 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'Max 100 per request, jangan serakah bre' 
            });
        }

        let result = 0;
        const startTime = Date.now();

        try {
            switch(type) {
                case 'followers':
                    result = await injectFollowers(targetId, amount);
                    break;
                case 'views':
                    result = await injectViews(targetId, amount);
                    break;
                case 'likes':
                    result = await injectLikes(targetId, amount);
                    break;
                default:
                    return res.status(400).json({ success: false, error: 'Tipe invalid' });
            }

            return res.json({
                success: true,
                data: {
                    injected: result,
                    requested: amount,
                    successRate: `${Math.round((result / amount) * 100)}%`,
                    target: targetId,
                    type: type,
                    durationMs: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (e) {
            return res.json({
                success: false,
                error: `Injection failed: ${e.message}`,
                partialResult: result
            });
        }
    }

    // Invalid action
    return res.status(400).json({ 
        success: false, 
        error: 'Action tidak dikenal. Gunakan: resolve, resolveVideo, atau inject' 
    });
};
