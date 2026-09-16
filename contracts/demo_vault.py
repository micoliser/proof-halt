# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl
from genlayer.storage import TreeMap


WITHDRAW_ACTION = "withdraw"


class DemoVault(gl.contract.Contract):
    """
    Toy vault governed by a Halt Module protocol.
    Deposits are always accepted; withdraws require is_action_allowed(..., "withdraw").
    """

    halt_module: gl.Address
    protocol_id: gl.u256
    balances: TreeMap[str, gl.u256]

    def __init__(self, halt_module: gl.Address, protocol_id: int):
        halt_module = self._parse_address(halt_module)
        pid = int(protocol_id)
        if pid < 0:
            raise gl.vm.UserError("protocol_id must be >= 0")
        self.halt_module = halt_module
        self.protocol_id = gl.u256(pid)

    def _parse_address(self, address) -> gl.Address:
        if isinstance(address, gl.Address):
            return address
        if isinstance(address, (bytes, bytearray)):
            return gl.Address(bytes(address))
        if isinstance(address, int):
            return gl.Address("0x" + format(address, "040x"))
        if isinstance(address, str):
            s = address.strip()
            if not s.startswith(("0x", "0X")):
                s = "0x" + s
            return gl.Address(s)
        if hasattr(address, "as_bytes"):
            return gl.Address(address.as_bytes)
        raise gl.vm.UserError("invalid address")

    def _balance_key(self, address: gl.Address) -> str:
        return address.as_hex

    def _require_withdraw_allowed(self) -> None:
        halt = gl.contract.get_at(self.halt_module)
        allowed = halt.view().is_action_allowed(int(self.protocol_id), WITHDRAW_ACTION)
        if not allowed:
            raise gl.vm.UserError(
                "Withdraw blocked: linked Halt Module protocol is halted "
                f"(action '{WITHDRAW_ACTION}' not allowed)"
            )

    @gl.public.write.payable
    def deposit(self) -> None:
        amount = int(gl.message.value)
        if amount <= 0:
            raise gl.vm.UserError("must send a non-zero amount")
        sender = gl.message.sender_address
        key = self._balance_key(sender)
        current = int(self.balances.get(key, gl.u256(0)))
        self.balances[key] = gl.u256(current + amount)

    @gl.public.write
    def withdraw(self, amount: int) -> None:
        self._require_withdraw_allowed()
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError("amount must be > 0")
        sender = gl.message.sender_address
        key = self._balance_key(sender)
        current = int(self.balances.get(key, gl.u256(0)))
        if amt > current:
            raise gl.vm.UserError("insufficient balance")
        self.balances[key] = gl.u256(current - amt)
        gl.contract.get_at(sender).emit_transfer(value=gl.u256(amt))

    @gl.public.view
    def get_balance(self, address) -> gl.u256:
        addr = self._parse_address(address)
        return self.balances.get(self._balance_key(addr), gl.u256(0))

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "halt_module": self.halt_module.as_hex,
            "protocol_id": int(self.protocol_id),
        }
