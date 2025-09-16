const Group = require('../models/Group');
const Client = require('../models/Client'); // Assuming Client model will be created
const mongoose = require('mongoose');

// Create a new group
exports.createGroup = async (req, res) => {
  const { groupName, groupCode, branchName, branch, meetingDay, meetingSchedule, meetingTime, loanOfficer,
    community, totalGroupCount,
    presidentName, presidentNumber, securityName, securityNumber, treasurerName, treasurerNumber,
    police1Name, police1Number, police2Name, police2Number } = req.body;

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
      loanOfficer: loanOfficer || undefined,
      community: community || undefined,
      totalGroupCount: typeof totalGroupCount === 'number' ? totalGroupCount : (totalGroupCount ? Number(totalGroupCount) : undefined),
      // Leadership fields (optional)
      presidentName,
      presidentNumber,
      securityName,
      securityNumber,
      treasurerName,
      treasurerNumber,
      police1Name,
      police1Number,
      police2Name,
      police2Number,
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
    const groups = await Group.find()
      .populate('clients', 'memberName passBookNumber')
      .populate('leader', 'memberName passBookNumber')
      .populate('secretary', 'memberName passBookNumber')
      .populate('treasurer', 'memberName passBookNumber');
    res.json(groups);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get group by ID
exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('clients')
      .populate('leader', 'memberName passBookNumber')
      .populate('secretary', 'memberName passBookNumber')
      .populate('treasurer', 'memberName passBookNumber');
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
    const { groupName, branchName, branch, meetingDay, meetingSchedule, meetingTime, status, loanOfficer,
      community, totalGroupCount,
      presidentName, presidentNumber, securityName, securityNumber, treasurerName, treasurerNumber,
      police1Name, police1Number, police2Name, police2Number } = req.body;

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
    if (community !== undefined) updateData.community = community;
    if (totalGroupCount !== undefined) updateData.totalGroupCount = typeof totalGroupCount === 'number' ? totalGroupCount : Number(totalGroupCount);
    // Leadership fields (optional)
    if (presidentName !== undefined) updateData.presidentName = presidentName;
    if (presidentNumber !== undefined) updateData.presidentNumber = presidentNumber;
    if (securityName !== undefined) updateData.securityName = securityName;
    if (securityNumber !== undefined) updateData.securityNumber = securityNumber;
    if (treasurerName !== undefined) updateData.treasurerName = treasurerName;
    if (treasurerNumber !== undefined) updateData.treasurerNumber = treasurerNumber;
    if (police1Name !== undefined) updateData.police1Name = police1Name;
    if (police1Number !== undefined) updateData.police1Number = police1Number;
    if (police2Name !== undefined) updateData.police2Name = police2Name;
    if (police2Number !== undefined) updateData.police2Number = police2Number;

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

// Set or unset group leader
exports.setLeader = async (req, res) => {
  try {
    const { id } = req.params; // group id
    const { clientId } = req.body; // may be undefined/null to unset

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id).select('clients leader');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Unset leader
    if (!clientId) {
      group.leader = undefined;
      await group.save();
      const populated = await Group.findById(id)
        .populate('clients', 'memberName passBookNumber')
        .populate('leader', 'memberName passBookNumber');
      return res.json(populated);
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }

    const isMember = Array.isArray(group.clients) && group.clients.some(c => String(c) === String(clientId));
    if (!isMember) {
      return res.status(400).json({ message: 'Client does not belong to this group' });
    }

    group.leader = clientId;
    await group.save();

    const populated = await Group.findById(id)
      .populate('clients', 'memberName passBookNumber')
      .populate('leader', 'memberName passBookNumber');
    res.json(populated);
  } catch (error) {
    console.error('[GROUPS] setLeader error:', error.stack || error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Set or unset group secretary
exports.setSecretary = async (req, res) => {
  try {
    const { id } = req.params; // group id
    const { clientId } = req.body; // may be undefined/null to unset

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id).select('clients secretary');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Unset secretary
    if (!clientId) {
      group.secretary = undefined;
      await group.save();
      const populated = await Group.findById(id)
        .populate('clients', 'memberName passBookNumber')
        .populate('leader', 'memberName passBookNumber')
        .populate('secretary', 'memberName passBookNumber')
        .populate('treasurer', 'memberName passBookNumber');
      return res.json(populated);
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }

    const isMember = Array.isArray(group.clients) && group.clients.some(c => String(c) === String(clientId));
    if (!isMember) {
      return res.status(400).json({ message: 'Client does not belong to this group' });
    }

    group.secretary = clientId;
    await group.save();

    const populated = await Group.findById(id)
      .populate('clients', 'memberName passBookNumber')
      .populate('leader', 'memberName passBookNumber')
      .populate('secretary', 'memberName passBookNumber')
      .populate('treasurer', 'memberName passBookNumber');
    res.json(populated);
  } catch (error) {
    console.error('[GROUPS] setSecretary error:', error.stack || error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Set or unset group treasurer
exports.setTreasurer = async (req, res) => {
  try {
    const { id } = req.params; // group id
    const { clientId } = req.body; // may be undefined/null to unset

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid group id' });
    }

    const group = await Group.findById(id).select('clients treasurer');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Unset treasurer
    if (!clientId) {
      group.treasurer = undefined;
      await group.save();
      const populated = await Group.findById(id)
        .populate('clients', 'memberName passBookNumber')
        .populate('leader', 'memberName passBookNumber')
        .populate('secretary', 'memberName passBookNumber')
        .populate('treasurer', 'memberName passBookNumber');
      return res.json(populated);
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }

    const isMember = Array.isArray(group.clients) && group.clients.some(c => String(c) === String(clientId));
    if (!isMember) {
      return res.status(400).json({ message: 'Client does not belong to this group' });
    }

    group.treasurer = clientId;
    await group.save();

    const populated = await Group.findById(id)
      .populate('clients', 'memberName passBookNumber')
      .populate('leader', 'memberName passBookNumber')
      .populate('secretary', 'memberName passBookNumber')
      .populate('treasurer', 'memberName passBookNumber');
    res.json(populated);
  } catch (error) {
    console.error('[GROUPS] setTreasurer error:', error.stack || error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
