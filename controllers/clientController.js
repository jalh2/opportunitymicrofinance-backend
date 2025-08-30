const Client = require('../models/Client');
const Group = require('../models/Group');
const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const snapshotService = require('../services/snapshotService');

// Register a new client
exports.registerClient = async (req, res) => {
  const { branchName, branchCode, groupName, groupCode, memberName, memberImage, memberAge, guardianName, memberNumber, admissionDate, passBookIssuedDate, nationalId, memberSignature } = req.body;

  try {
    const group = await Group.findOne({ groupCode });
    if (!group) {
        return res.status(404).json({ message: 'Group not found' });
    }

    // Normalize and derive consistent values from the group and request body
    // Ensure we always have a valid groupName and groupCode coming from DB
    const resolvedGroupName = group.groupName;
    const resolvedGroupCode = group.groupCode;
    // Prefer request-provided branchName/branchCode, fall back to group's branchName and a derived code
    const resolvedBranchName = branchName || group.branchName || '';
    const resolvedBranchCode = branchCode || (resolvedBranchName ? resolvedBranchName.substring(0, 3).toUpperCase() + '01' : '');

    // Generate a new passbook number atomically (e.g., PB-000001)
    const counter = await Counter.findByIdAndUpdate(
      'passbook',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const generatedPassBookNumber = `PB-${String(counter.seq).padStart(6, '0')}`;

    const client = new Client({
        passBookNumber: generatedPassBookNumber,
        branchName: resolvedBranchName,
        branchCode: resolvedBranchCode,
        groupName: resolvedGroupName,
        groupCode: resolvedGroupCode,
        memberName,
        memberImage,
        memberAge,
        guardianName,
        memberNumber,
        admissionDate,
        passBookIssuedDate,
        nationalId,
        memberSignature,
        group: group._id,
        // registrar attribution
        createdBy: (req.user && req.user._id) || undefined,
        createdByName: (req.user && req.user.username) || undefined,
        createdByEmail: (req.user && req.user.email) || undefined
    });

    await client.save();

    // Add client to the group's clients list
    if (!Array.isArray(group.clients)) {
      group.clients = [];
    }
    group.clients.push(client._id);
    await group.save();

    // Admission fee: LRD 1,000 collected at registration
    try {
      const fee = 1000;
      await snapshotService.incrementMetrics({
        branchName: resolvedBranchName || '',
        branchCode: resolvedBranchCode || '',
        currency: 'LRD',
        date: admissionDate || new Date(),
        inc: {
          totalAdmissionFees: fee,
          totalFeesCollected: fee,
          totalProfit: fee,
        },
        // audit/context
        group: group._id,
        groupName: resolvedGroupName,
        groupCode: resolvedGroupCode,
        updatedBy: (req.user && req.user.id) || null,
        updatedByName: (req.user && req.user.username) || '',
        updatedByEmail: (req.user && req.user.email) || '',
        updateSource: 'clientRegistration',
      });
    } catch (e) {
      console.warn('[CLIENTS] registerClient: snapshot admission fee increment failed', e.message);
      // Do not fail client creation if snapshot update fails
    }

    res.status(201).json(client);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get all clients
exports.getAllClients = async (req, res) => {
  try {
    const clients = await Client.find().populate('group', 'groupName branchName');
    res.json(clients);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Get client by ID
exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate('group', 'groupName');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Update a client
exports.updateClient = async (req, res) => {
  try {
    const updateData = { ...req.body };
    // Do not allow passBookNumber to be updated from the client side
    if (Object.prototype.hasOwnProperty.call(updateData, 'passBookNumber')) {
      delete updateData.passBookNumber;
    }
    const client = await Client.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// Delete a client
exports.deleteClient = async (req, res) => {
  try {
    console.log('[CLIENTS] deleteClient start', { id: req.params.id, path: req.path, method: req.method });
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.warn('[CLIENTS] deleteClient: invalid ObjectId', { id: req.params.id });
      return res.status(400).json({ message: 'Invalid client id' });
    }
    const client = await Client.findById(req.params.id);
    if (!client) {
      console.warn('[CLIENTS] deleteClient: client not found', { id: req.params.id });
      return res.status(404).json({ message: 'Client not found' });
    }

    // Remove client from their group
    if (client.group && mongoose.Types.ObjectId.isValid(client.group)) {
      try {
        await Group.updateOne({ _id: client.group }, { $pull: { clients: client._id } });
        console.log('[CLIENTS] deleteClient: removed from group.clients', { groupId: client.group?.toString?.() });
      } catch (e) {
        console.warn('[CLIENTS] deleteClient: failed to update group membership', { error: e.message });
      }
    } else {
      console.log('[CLIENTS] deleteClient: no valid group to update');
    }

    await Client.findByIdAndDelete(req.params.id);
    console.log('[CLIENTS] deleteClient success', { id: req.params.id });
    res.json({ message: 'Client removed' });
  } catch (error) {
    console.error('[CLIENTS] deleteClient error:', error.stack || error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};
