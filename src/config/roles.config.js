const ROLE_ADMINISTRATOR = 1;
const ROLE_L1_APPROVER = 2;
const ROLE_L2_APPROVER = 5;

function isAdministrator(roleId) {
    return Number(roleId) === ROLE_ADMINISTRATOR;
}

function isApprover(roleId) {
    return (
        isAdministrator(roleId) ||
        Number(roleId) === ROLE_L1_APPROVER ||
        Number(roleId) === ROLE_L2_APPROVER
    );
}

module.exports = {
    ROLE_ADMINISTRATOR,
    ROLE_L1_APPROVER,
    ROLE_L2_APPROVER,
    isAdministrator,
    isApprover,
};
