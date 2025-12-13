from abc import ABC, abstractmethod

class BaseInterface(ABC):
    @abstractmethod
    def connect(self):
        pass

    @abstractmethod
    def disconnect(self):
        pass

    @abstractmethod
    def start(self):
        pass

class WebSocketInterface(BaseInterface):
    @abstractmethod
    def send(self, message):
        pass

    @abstractmethod
    def receive(self):
        pass
