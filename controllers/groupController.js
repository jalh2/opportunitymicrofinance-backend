const Group = require('../models/Group');
const Client = require('../models/Client'); // Assuming Client model will be created
const mongoose = require('mongoose');

// Create a new group
exports.createGroup = async (req, res) => {
  const { groupName, groupCode, branchName, branch, meetingDay, meetingSchedule, meetingTime, loanOfficer } = req.body;

  try {
    let group = await Group.findOne({ groupCode });
    if (group) {
      return res.status(400).json({ message: 'Group with this code already exists' });
    }

    // Normalize legacy payloads
    const normalizedBranchName = branchName || branch;
    const normalizedMeetingDay = meetingDay || meetingSchedule;

    group = new Group({
      groupName,
      groupCode,
      branchName: normalizedBranchName,
      meetingDay: normalizedMeetingDay,
      meetingTime: meetingTime || '',
      loanOfficer: loanOfficer || undefined
    });

    await group.save();
    res.status(201).json(group);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get all groups
exports.getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find().populate('clients', 'memberName passBookNumber'); // Populate client display fields
    res.json(groups);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get group by ID
exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate('clients');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    res.json(group);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Update a group
exports.updateGroup = async (req, res) => {
  try {
    const { groupName, branchName, branch, meetingDay, meetingSchedule, meetingTime, status, loanOfficer } = req.body;

    // Only allow updates to known fields, normalizing legacy names
    const updateData = {};
    if (groupName !== undefined) updateData.groupName = groupName;
    const normalizedBranchName = branchName || branch;
    if (normalizedBranchName !== undefined) updateData.branchName = normalizedBranchName;
    const normalizedMeetingDay = meetingDay || meetingSchedule;
    if (normalizedMeetingDay !== undefined) updateData.meetingDay = normalizedMeetingDay;
    if (meetingTime !== undefined) updateData.meetingTime = meetingTime;
    if (status !== undefined) updateData.status = status;
    if (loanOfficer !== undefined) updateData.loanOfficer = loanOfficer;

    const group = await Group.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    res.json(group);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Delete a group
exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[GROUPS] deleteGroup start', { id, path: req.path, method: req.method });
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn('[GROUPS] deleteGroup: invalid ObjectId', { id });
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if group has clients before deleting
    const clientCount = Array.isArray(group.clients) ? group.clients.length : 0;
    if (clientCount > 0) {
      return res.status(400).json({ message: 'Cannot delete group with active clients. Please reassign clients first.' });
    }

    await Group.findByIdAndDelete(id);
    console.log('[GROUPS] deleteGroup success', { id });
    res.json({ message: 'Group removed' });
  } catch (error) {
    console.error('[GROUPS] deleteGroup error:', error.stack || error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Search clients by group
exports.searchClientsByGroup = async (req, res) => {
    try {
        const group = await Group.findById(req.params.id).populate('clients');
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }
        res.json(group.clients);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server error');
    }
};
