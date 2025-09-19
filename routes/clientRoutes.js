const express = require('express');
const router = express.Router();
const {
  registerClient,
  getAllClients,
  getClientsCount,
  getClientById,
  updateClient,
  deleteClient
} = require('../controllers/clientController');

// @route   POST api/clients/register
// @desc    Register a new client
router.post('/register', registerClient);

// @route   GET api/clients
// @desc    Get all clients
router.get('/', getAllClients);

// @route   GET api/clients/count
// @desc    Get clients count (optionally filtered by branchCode)
router.get('/count', getClientsCount);

// @route   GET api/clients/:id
// @desc    Get client by ID
router.get('/:id', getClientById);

// @route   PUT api/clients/:id
// @desc    Update a client
router.put('/:id', updateClient);

// @route   DELETE api/clients/:id
// @desc    Delete a client
router.delete('/:id', deleteClient);

module.exports = router;
