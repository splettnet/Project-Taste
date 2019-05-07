"use strict"
var db = new (function(db, logger) {

    let debugMode = !!window.debugMode;

    let _db = db;
    let _logger = logger;
    let _doLog = typeof(_logger) !== "undefined";

    db.settings({timestampsInSnapshots: true});
    
    function _createOrUpdateUser(uid, data){
        let docRef = _db.collection("users").doc(uid); 
        
        let ret = {success: true};

        return _db.runTransaction(tran => {
            return tran.get(docRef).then(doc => {
                ret.isNew = !doc.exists;
                if(doc.exists){
                    if (!doc.data().lastSignIn.isEqual(data.lastSignIn)){
                        tran.update(docRef, {
                            lastSignIn: data.lastSignIn
                        });
                    }else{
                        //  need to perform write in a transaction even
                        //  if not needed data wise. We need in a tran 
                        //  to keep ACID safe
                        //  https://groups.google.com/forum/#!topic/google-cloud-firestore-discuss/LfD_YEnGVu4
                        tran.update(docref,{});
                    }
                }else{
                    tran.set(docRef, data);
                }
            });
        }).then(() => ret).catch(() => ({success: false}));
    }

    function _createIngredient(data){
        let batch = _db.batch();
        
        let docRef = _db.collection("ingredients").doc(data.name);
        batch.set(docRef,data);

        batch.commit().then(function(){
            if (_doLog) _logger.log("added ingredient " + data.name);
        });
    }

    function _getEventListPaginator(pageSize, game){
        let query = db.collection("events");
        if (game) {
            query = query.where("GameRefData.Name", "==", game);
        } 
        return new Paginator(query.orderBy("StartDate"), pageSize);
    }

    //Classes
    function Paginator(query, pageSize, rejectMessage){
        const _pageSize = pageSize;
        const _baseQuery = query;
        let _query = query;
        let _lastDoc = null;
        let _pageNumber = 0;
        let _isEndOfData = false;
        let _isQuerying = false;

        this.pageNumber = () => _pageNumber;
        this.isEndOfData = () => _isEndOfData;
        this.isQuerying = () => _isQuerying;

        this.fetchNext = _fetchNext;

        function _fetchNext(){
            if (_isEndOfData) {
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {

                _isQuerying = true;

                _query.limit(pageSize).get()
                    .then(data => {

                        _isQuerying = false;

                        if(data.empty){
                            _isEndOfData = true;
                            _pageNumber = -1;

                            data.pageNumber = _pageNumber;
                            resolve(data);
                            return;
                        }

                        _lastDoc = data.docs[data.size-1];
                        _query = _baseQuery.startAfter(_lastDoc);
                        _pageNumber += 1;

                        data.pageNumber = _pageNumber;

                        resolve(data);
                    })
                    .catch(err => {
                        reject(rejectMessage || "Error querying database");
                    });
            });
        }
    }

})(firebase.firestore());