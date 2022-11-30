var express = require('express');
var router = express.Router();
const stock_read_log = require('../models/stock_read_log');
const FileSystem = require("fs");
const db = require('../mongodb');

router.use('/export-data', async (req, res) => {
  const list = await stock_read_log.aggregate([
    {
      $match: {}
    }
  ]).exec();
  
  FileSystem.writeFile('./stock_read_log.json', JSON.stringify(list), (error) => {
      if (error) throw error;
  });

  console.log('stock_read_log.json exported!');
  res.json({statusCode: 1, message: 'stock_read_log.json exported!'})
});

router.use('/import-data', async (req, res) => {
  const list = await stock_read_log.aggregate([
    {
      $match: {}
    }
  ]).exec();
  
  FileSystem.readFile('./stock_read_log.json', async (error, data) => {
      if (error) throw error;

      const list = JSON.parse(data);

      const deletedAll = await stock_read_log.deleteMany({});

      const insertedAll = await stock_read_log.insertMany(list);

      console.log('stock_read_log.json imported!');
  res.json({statusCode: 1, message: 'stock_read_log.json imported!'})
  });

  
})

router.use('/edit-repacking-data', async (req, res) => {
  const {company_id, payload, new_qr_list, reject_qr_list} = req.body;
  let parameter = {
    company_id,
    payload
  };
  
  const new_payload = new_qr_list.map((value) => value.payload);
  const old_payload = reject_qr_list.map((value) => value.payload);
  const payloads = [...new_payload, ...old_payload];
  const session = await db.startSession();
  try {
    session.startTransaction();
    const findProducts = await stock_read_log.find({payload: {$in:payloads}}).session(session);
    if(findProducts.length == 0){
      await session.abortTransaction();
      return res.status(404).json({message: 'product not found'});
    }

    const findStatus = findProducts.find(value => (value.status != 1 && value.status_qc == 1));
    if(findStatus){
      await session.abortTransaction();
      return res.status(404).json({message: 'product already rejected', data: findStatus.payload});
    }
    const findNewProduct = await stock_read_log.find({"qr_list.payload":{$in:new_payload}}).session(session);
    let removeProduct = [];
    const newProduct = findNewProduct.map((value) => {
      const params = value.qr_list.find(item => new_payload.find(data => data == item.payload));
      
      if(params){
        removeProduct.push(stock_read_log.findOneAndUpdate({payload:value.payload, company_id}, {$pull:{qr_list:{payload: params.payload}}, $inc:{qty:-1}, $set:{last_updated: new Date()}}))
      }
      return params;
    });
    const pull = stock_read_log.findOneAndUpdate(
      parameter, 
      {$pull:{qr_list:{payload:{$in:old_payload}}},$set:{last_updated: new Date()}}
      )
      .session(session);
    const push = stock_read_log.findOneAndUpdate(
      parameter, 
      {$push:{qr_list:{$each:newProduct, sort:{payload: -1}}}, $set:{last_updated: new Date()}})
      .session(session);
    const updateStatus = stock_read_log.updateMany({payload:{$in:old_payload}}, {$set:{status: 0, status_qc:1, last_updated:new Date()}}).session(session);
    await Promise.all([...removeProduct, pull, push, updateStatus]);
    await session.commitTransaction();
    return res.status(200).json({message: 'success'});
  } catch (error) {
    console.log(error);
    await session.abortTransaction();
    return res.status(500).json({message: 'something wrong'});
  }
})

router.use('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
