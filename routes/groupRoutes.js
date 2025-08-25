const express = require('express');
const router = express.Router();
const {
  createGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  searchClientsByGroup
} = require('../controllers/groupController');

// @route   POST api/groups
// @desc    Create a group
router.post('/', createGroup);

// @route   GET api/groups
// @desc    Get all groups
router.get('/', getAllGroups);

// @route   GET api/groups/:id
// @desc    Get group by ID
router.get('/:id', getGroupById);

// @route   GET api/groups/:id/clients
// @desc    Search clients by group
router.get('/:id/clients', searchClientsByGroup);

// @route   PUT api/groups/:id
// @desc    Update a group
router.put('/:id', updateGroup);

// @route   DELETE api/groups/:id
// @desc    Delete a group
router.delete('/:id', deleteGroup);

module.exports = router;
