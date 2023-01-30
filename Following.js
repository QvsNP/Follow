const { TwitterApi, ETwitterStreamEvent } = require("twitter-api-v2");

const config = require('./xConfig.js');
console.log(config);

const fs = require('fs');


const client = new TwitterApi(config.bearer);

const userClient = new TwitterApi({
    appKey: config.appKey,
    appSecret: config.appSecret,
    // Following access tokens are not required if you are
    // at part 1 of user-auth process (ask for a request token)
    // or if you want a app-only client (see below)
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
});


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
        this.followRateLimit = dbFollow.readRateLimit();
        this.reset = true;
        console.log(this.followers.length)
        console.log(this.following.length)
        this.main();
        // this.gatherFollowersAndFollowing();
    }

    async gatherFollowersAndFollowing() {
        let T1;
        let T2;
        if (this.getNextToken(this.followers) !== "" || this.followers.length === 0) {
            T1 = await this.getFollowers();
        }
        if (this.getNextToken(this.following) !== "" || this.following.length === 0) {
            T2 = await this.getFollowing();
        }
        console.log("t: ", T1, T2);

        if ((T1 === undefined && T2 === undefined)) {
            this.buildSets();
            this.addRemovedFollowingToList();
            this.addNonFollowsToList();
            fs.writeFileSync(dbFollowing, "[ ")
            fs.writeFileSync(dbFollowers, "[ ")
        }

        console.log("Sleeping for 1 Hour");
        sleep(waitTime).then(
            () => {
                this.main();
            }
        );
    }


    main() {
        if ((this.removeFollowList.size > 0 && config.unfollow) ||
            (this.AddFollowersList.size > 0 && config.follow)) {
            if (config.follow) {
                this.follow();
            }
            if (config.unfollow) {
                this.unfollow();
            }
            console.log("Sleeping for 1 Hour");
            sleep(waitTime).then(
                () => {
                    this.main();
                }
            );

        } else {
            this.gatherFollowersAndFollowing();
        }
        

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

    async getFollowers() {
        let obj = this.getTokenObject(this.followers);
        console.log(obj);
        return new Promise((resolve, reject) => {
            userClient.v2.followers(userID, obj).then((data) => {
                this.twitterFollowReturn(data, resolve, dbFollowers, this.followers);
            });
        });
    }

    async getFollowing() {
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


    async addNonFollowsToList() {
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

    async addRemovedFollowingToList() {
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
            if (this.rateLimitTooHigh()) {
                return;
            }
            console.log(val);
            await sleep(3000);
            await userClient.v2.unfollow(userID, val).then((data) => {
                console.log("unfollowed: " + data);
                this.followRateLimit++;
                dbFollow.writeRateLimit(this.followRateLimit)
            });
            this.removeFollowList.delete(val);
            dbFollow.writeDB(dbRemoveFollowList, Array.from(this.removeFollowList));

        }
    }

    async follow() {
        let iterator = this.AddFollowersList.values();
        for (var it = iterator, val = null; val = it.next().value;) {

            if (this.rateLimitTooHigh()) {
                return;
            }
            console.log(val);
            await sleep(3000);
            await userClient.v2.follow(userID, val).then((data) => {
                console.log("Followed: " + data);
                this.followRateLimit++;
                dbFollow.writeRateLimit(this.followRateLimit)
            });
            this.AddFollowersList.delete(val);
            dbFollow.writeDB(dbAddFollowersList, Array.from(this.AddFollowersList));
        }
    }

    rateLimitTooHigh() {
        if (this.followRateLimit >= 40) {
            console.log("rate limit to high");
            this.followRateLimit = 0;
            dbFollow.writeRateLimit(this.followRateLimit)
            return true;
        } else {
            return false;
        }
    }
}

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

    static writeRateLimit(number) {
        fs.writeFileSync(dbRateLimit, JSON.stringify(number));
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
        fs.writeFileSync(dbRateLimit, "0")
    }
}



async function start() {
    // dbFollow.cleanDB();
    await userClient.v2.userByUsername(config.userName).then((data) => {
        console.log(data);
        userID = data.data.id;
        new Following()
    });
}

start();



