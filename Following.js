const { TwitterApi, ETwitterStreamEvent } = require("twitter-api-v2");

let config;
console.log(config);

const fs = require('fs');


let client;

let userClient;


let userID;

const waitTime = 3600000;

const result_count = 1000;

class Following {
    constructor() {
        // dbFollow.cleanDB();
        dbFollow.createDB();
        this.following = dbFollow.readDB(dbFollowing);
        this.followers = dbFollow.readDB(dbFollowers);
        this.followersSet = new Set();
        this.followingSet = new Set();
        this.removeFollowList = new Set(dbFollow.readDB(dbRemoveFollowList));
        this.AddFollowersList = new Set(dbFollow.readDB(dbAddFollowersList));
        this.rateLimit = dbFollow.readRateLimit(dbRateLimit);
        console.log(this.rateLimit);
        this.checkLimits();
    }

    async gatherFollowersAndFollowing() {
        console.log("Gathering Followers and Following");
        let T1;
        let T2;
        if (this.getNextToken(this.followers) !== "" || this.followers.length === 0) {
            T1 = await this.getFollowers();
            this.rateLimit.FollowLookUP.limit++;
        }
        if (this.getNextToken(this.following) !== "" || this.following.length === 0) {
            T2 = await this.getFollowing();
            this.rateLimit.FollowLookUP.limit++;
        }
        console.log("t: ", T1, T2);

        if ((T1 === undefined && T2 === undefined)) {
            console.log("Finished Gathering Followers and Following");
            this.buildSets();
            this.addRemovedFollowingToList();
            this.addNonFollowsToList();
            fs.writeFileSync(dbFollowing, "[ ")
            fs.writeFileSync(dbFollowers, "[ ")
            await sleep(waitTime);
            this.followers = [];
            this.following = [];
            await this.checkLimits();
        } else {
            if (this.rateLimit.FollowLookUP.limitHour >= this.rateLimit.FollowLookUP.maxLimitHour) {
                console.log("Sleeping for 1 hour");
                await sleep(waitTime);
                console.log("Done Sleep");
                this.rateLimit.FollowLookUP.limit = 0;
                await this.checkLimits();
            }else {
                this.gatherFollowersAndFollowing();
            }
        }
    }

    async checkLimits() {
        // console.log("check Limits");
        if (this.AddFollowersList.size > 0 || this.AddFollowersList.size > 0) {
            if (config.follow) {
                this.resetRateLimit(this.rateLimit.Follow);
                if (!this.rateLimitHourTooHigh(this.rateLimit.Follow) &&
                    !this.rateLimitDayTooHigh(this.rateLimit.Follow)) {
                    console.log("Follow");
                    await this.follow();
                }
            }
            if (config.unfollow) {
                this.resetRateLimit(this.rateLimit.Unfollow);
                if (!this.rateLimitHourTooHigh(this.rateLimit.Unfollow) &&
                    !this.rateLimitDayTooHigh(this.rateLimit.Unfollow)) {
                    await this.unfollow();
                }
            }
        } else {
            await this.gatherFollowersAndFollowing();
            return;
        }
        await sleep(1000)
        await this.checkLimits();
        // console.log("sleep 1000");
    }




    buildSets() {
        console.log("Building Sets");
        for (let i = 0; i < this.followers.length; i++) {
            for (let j = 0; j < this.followers[i].idList.length; j++) {
                this.followersSet.add(this.followers[i].idList[j]);
            }
        }
        for (let i = 0; i < this.following.length; i++) {
            for (let j = 0; j < this.following[i].idList.length; j++) {
                this.followingSet.add(this.following[i].idList[j]);
            }
        }
    }

    getNextToken(list) {
        let last = list[list.length - 1];
        if (last === undefined) {
            return "";
        }
        if (last.next_token !== undefined) {
            return last.next_token;
        }
        return "";
    }

    getTokenObject(list) {
        let obj = {
            "max_results": result_count
        };
        let nextToken = this.getNextToken(list)
        if (nextToken !== undefined && nextToken !== "") {
            obj.pagination_token = nextToken;
        }
        return obj;
    }

    getFollowers() {
        let obj = this.getTokenObject(this.followers);
        console.log(obj);
        return new Promise((resolve, reject) => {
            userClient.v2.followers(userID, obj).then((data) => {
                this.twitterFollowReturn(data, resolve, dbFollowers, this.followers);
            });
        });
    }

    getFollowing() {
        let obj = this.getTokenObject(this.following);
        console.log(obj);
        return new Promise((resolve, reject) => {
            userClient.v2.following(userID, obj).then((data) => {
                this.twitterFollowReturn(data, resolve, dbFollowing, this.following);
            });
        });
    }


    twitterFollowReturn(data, resolve, dbFile, followArray) {
        let _next_token = data.meta.next_token
        let storeObj = {
            idList: [],
            next_token: _next_token
        }
        for (let i = 0; i < data.data.length; i++) {
            storeObj.idList.push(data.data[i].id)
        }
        followArray.push(storeObj);
        dbFollow.dbAppened(dbFile, storeObj);
        resolve(_next_token)
    }

    addNonFollowsToList() {
        let iterator = this.followersSet.values();
        for (var it = iterator, val = null; val = it.next().value;) {
            if (this.followingSet.has(val)) {
                continue
            }
            else {
                // console.log("push add");
                this.AddFollowersList.add(val);
            }
        }
        dbFollow.writeDB(dbAddFollowersList, Array.from(this.AddFollowersList));
    }

    addRemovedFollowingToList() {
        let iterator = this.followingSet.values();
        for (var it = iterator, val = null; val = it.next().value;) {
            if (this.followersSet.has(val)) {
                continue
            }
            else {
                console.log(val);
                this.removeFollowList.add(val);
            }
        }
        dbFollow.writeDB(dbRemoveFollowList, Array.from(this.removeFollowList));
    }

    async unfollow() {
        let iterator = this.removeFollowList.values();
        for (var it = iterator, val = null; val = it.next().value;) {
            if (this.rateLimitHourTooHigh(this.rateLimit.Unfollow)) {
                return;
            }
            console.log(val);
            await sleep(3000);
            await userClient.v2.unfollow(userID, val).then((data) => {
                console.log("unfollowed: " + data);
                this.updateRateLimit(this.rateLimit.Unfollow)
            });
            this.removeFollowList.delete(val);
            dbFollow.writeDB(dbRemoveFollowList, Array.from(this.removeFollowList));

        }
    }

    async follow() {
        let iterator = this.AddFollowersList.values();
        for (var it = iterator, val = null; val = it.next().value;) {

            if (this.rateLimitHourTooHigh(this.rateLimit.Follow)) {
                return;
            }
            console.log(val);
            await sleep(3000);
            await userClient.v2.follow(userID, val).then((data) => {
                console.log("Followed: " + data);
                this.updateRateLimit(this.rateLimit.Follow)
            });
            this.AddFollowersList.delete(val);
            dbFollow.writeDB(dbAddFollowersList, Array.from(this.AddFollowersList));
        }
        return;
    }

    rateLimitHourTooHigh(obj) {
        if (obj.limitHour >= obj.maxLimitHour) {
            return true;
        }
        return false;
    }

    rateLimitDayTooHigh(obj) {
        if (obj.limit >= obj.limitDay) {
            return true;
        }
        return false;
    }

    updateRateLimit(obj) {
        obj.limit++;
        obj.limitHour++;
        dbFollow.writeRateLimit(this.rateLimit);
    }

    resetRateLimit(obj) {
        // let ret = false;
        // console.log(`Hour: ${obj.Hour} < ${(Date.now() - (obj.Hour - 3600000))}`);
        if (obj.Hour < Date.now() - 3600000) {
            obj.Hour = Date.now();
            obj.limitHour = 0;
            // ret = true;
            dbFollow.writeRateLimit(this.rateLimit);
        }
        if (obj.Day < Date.now() - 86400000) {
            obj.Day = Date.now();
            obj.limit = 0;
            dbFollow.writeRateLimit(this.rateLimit);
            // ret = true;
        }
        // return ret;
    }
}

//Const day =  86400000


// sleep Function
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


let dbPath = "./dbFollow"
let dbFollowing = "./dbFollow/dbFollowing.txt"
let dbFollowers = "./dbFollow/dbFollowers.txt"
let dbRemoveFollowList = "./dbFollow/dbRemoveFollowList.txt";
let dbAddFollowersList = "./dbFollow/dbAddFollowersList.txt";
let dbRateLimit = "./dbFollow/dbRateLimit.txt";






class dbFollow {

    static readDB(file) {
        let data = fs.readFileSync(file, 'utf8');
        data = data.substring(0, data.length - 1);
        data += "]"
        return JSON.parse(data);
    }

    static dbAppened(file, obj) {
        fs.appendFileSync(file, JSON.stringify(obj) + ",");
    }

    static writeDB(file, obj) {
        fs.writeFileSync(file, JSON.stringify(obj));
    }

    static writeRateLimit(obj) {
        fs.writeFileSync(dbRateLimit, JSON.stringify(obj));
    }

    static readRateLimit() {
        let data = fs.readFileSync(dbRateLimit, 'utf8');
        return JSON.parse(data);
    }

    static removeDbFolder() {
        fs.rmSync("./dbFollow", { recursive: true, force: true });
    }

    static createDB() {
        if (!fs.existsSync("./dbFollow")) {
            console.log("creating folder")
            fs.mkdirSync("./dbFollow");
            dbFollow.cleanDB();
        }
    }

    static cleanDB() {
        fs.writeFileSync(dbFollowing, "[ ")
        fs.writeFileSync(dbFollowers, "[ ")
        fs.writeFileSync(dbRemoveFollowList, "[ ")
        fs.writeFileSync(dbAddFollowersList, "[ ")
        dbFollow.writeRateLimit({
            Follow: {
                Day: Date.now(),
                Hour: Date.now(),
                limitHour: 0,
                maxLimitHour: 16,
                limit: 0,
                maxLimit: 400
            },
            Unfollow: {
                Day: Date.now(),
                Hour: Date.now(),
                limitHour: 0,
                maxLimitHour: 16,
                limit: 0,
                maxLimit: 400
            },
            FollowLookUP: {

                Hour: Date.now(),
                limitHour: 0,
                maxLimitHour: 10,
            }
        })
    }
}



async function start(_config) {
    config = _config;
    userClient = new TwitterApi({
        appKey: config.appKey,
        appSecret: config.appSecret,
        // Following access tokens are not required if you are
        // at part 1 of user-auth process (ask for a request token)
        // or if you want a app-only client (see below)
        accessToken: config.accessToken,
        accessSecret: config.accessSecret,
    });

    client = new TwitterApi(config.bearer);




    // dbFollow.cleanDB();

    await userClient.v2.userByUsername(config.userName).then((data) => {
        console.log(data);
        userID = data.data.id;
        new Following()
    });
}


module.exports = {
    start: start
}




